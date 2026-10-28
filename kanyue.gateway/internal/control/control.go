// Package control is the gateway's control plane on the embedded PocketBase:
// it turns edited collections into published, versioned snapshots, keeps the
// endpoint table in step with discovery, and exposes the admin and registration
// API. The data plane only ever sees whole snapshots.
package control

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"kanyue.gateway/internal/config"
	"kanyue.gateway/internal/proxy"
	"kanyue.gateway/internal/schema"
	"kanyue.gateway/internal/snapshot"
)

// lastKnownGood is the snapshot file the data plane falls back to when the
// published configuration cannot be loaded or compiled at start.
const lastKnownGood = "gateway-snapshot.json"

type Control struct {
	app     core.App
	cfg     config.Config
	handler *proxy.Handler
	client  *http.Client

	publishMu sync.Mutex
	rebuild   chan struct{}
	syncing   sync.Map // service id → manifest sync in flight

	obs    observer
	alerts alertBook
}

func New(app core.App, cfg config.Config, handler *proxy.Handler) *Control {
	return &Control{app: app, cfg: cfg, handler: handler, rebuild: make(chan struct{}, 1),
		client: &http.Client{Timeout: 5 * time.Second}}
}

// Register wires the control plane into app and starts the data plane on serve.
func (c *Control) Register() {
	c.bindHooks()
	c.app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		if err := c.checkAdminAddress(se.Server.Addr); err != nil {
			return err
		}
		c.loadRoutes()
		if err := c.rebuildEndpoints(); err != nil {
			return err
		}
		if err := c.configureBackups(os.Getenv); err != nil {
			return err
		}
		ctx, cancel := context.WithCancel(context.Background())
		if err := c.openTelemetry(ctx); err != nil {
			cancel()
			return err
		}
		server, err := proxy.Serve(c.cfg.Listen, c.handler, func(err error) {
			c.app.Logger().Error("Data plane stopped", "error", err.Error())
		})
		if err != nil {
			cancel()
			return fmt.Errorf("data plane: %w", err)
		}
		go c.loop(ctx)
		go c.checkHealth(ctx)
		go c.alertLoop(ctx)
		c.app.OnTerminate().BindFunc(func(e *core.TerminateEvent) error {
			cancel()
			if err := server.Shutdown(10 * time.Second); err != nil {
				c.app.Logger().Warn("Data plane did not drain", "error", err.Error())
			}
			return e.Next()
		})
		c.routes(se)
		c.app.Logger().Info("Data plane listening", "addr", c.cfg.Listen, "version", c.handler.Version())
		return se.Next()
	})
}

// checkAdminAddress refuses a public admin bind: the admin plane edits what the internet reaches.
func (c *Control) checkAdminAddress(addr string) error {
	if c.cfg.AdminPublic {
		return nil
	}
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		return fmt.Errorf("admin address %q: %w", addr, err)
	}
	if host == "localhost" {
		return nil
	}
	ip, err := netip.ParseAddr(host)
	if err != nil || !(ip.IsLoopback() || ip.IsPrivate()) {
		return fmt.Errorf("admin address %q is not loopback or private; bind it to 127.0.0.1 or set GATEWAY_ADMIN_PUBLIC=1", addr)
	}
	return nil
}

func (c *Control) bindHooks() {
	c.bindSealing()
	c.bindTOTP()
	c.bindObservability()
	schedule := func(e *core.RecordEvent) error {
		c.scheduleRebuild()
		return e.Next()
	}
	c.app.OnRecordAfterCreateSuccess(schema.Instances, schema.Services).BindFunc(schedule)
	c.app.OnRecordAfterUpdateSuccess(schema.Instances, schema.Services).BindFunc(schedule)
	c.app.OnRecordAfterDeleteSuccess(schema.Instances, schema.Services).BindFunc(schedule)

	audit := func(action string) func(e *core.RecordRequestEvent) error {
		return func(e *core.RecordRequestEvent) error {
			if err := e.Next(); err != nil {
				return err
			}
			c.audit(actorOf(e.Auth), action, e.Collection.Name, e.Record.Id, e.Record.PublicExport())
			return nil
		}
	}
	c.app.OnRecordCreateRequest(schema.Audited...).BindFunc(audit("create"))
	c.app.OnRecordUpdateRequest(schema.Audited...).BindFunc(audit("update"))
	c.app.OnRecordDeleteRequest(schema.Audited...).BindFunc(audit("delete"))
}

func actorOf(auth *core.Record) string {
	if auth == nil {
		return ""
	}
	if email := auth.Email(); email != "" {
		return email
	}
	return auth.Id
}

// audit never fails the caller; a lost audit row is logged instead.
func (c *Control) audit(actor, action, resource, resourceID string, detail any) {
	collection, err := c.app.FindCachedCollectionByNameOrId(schema.AuditLogs)
	if err == nil {
		record := core.NewRecord(collection)
		record.Load(map[string]any{"actor": actor, "action": action, "resource": resource, "resourceId": resourceID, "detail": detail})
		err = c.app.Save(record)
	}
	if err != nil {
		c.app.Logger().Error("Audit write failed", "action", action, "resource", resource, "error", err.Error())
	}
}

// Release describes one publish. Force skips the healthy-instance check and
// must say why; the reason is kept with the version and in the audit log.
type Release struct {
	Note   string `json:"note"`
	Force  bool   `json:"force"`
	Reason string `json:"reason"`
}

func (r Release) note() string {
	if r.Force {
		return strings.TrimSpace(r.Note + " [forced: " + r.Reason + "]")
	}
	return r.Note
}

// Publish compiles the current collections into the next version and serves it.
func (c *Control) Publish(actor string, release Release) (int, error) {
	c.publishMu.Lock()
	defer c.publishMu.Unlock()
	cfg, err := c.collect()
	if err != nil {
		return 0, err
	}
	version, err := c.commit(cfg, actor, release, 0)
	if err != nil {
		return 0, err
	}
	c.audit(actor, "publish", schema.ConfigVersions, fmt.Sprint(version), map[string]any{"note": release.note()})
	return version, nil
}

// Rollback republishes an earlier version as the next version.
func (c *Control) Rollback(actor string, target int, release Release) (int, error) {
	c.publishMu.Lock()
	defer c.publishMu.Unlock()
	record, err := c.app.FindFirstRecordByFilter(schema.ConfigVersions, "version = {:v}", dbx.Params{"v": target})
	if err != nil {
		return 0, fmt.Errorf("version %d not found", target)
	}
	var cfg snapshot.Config
	if err := record.UnmarshalJSONField("config", &cfg); err != nil {
		return 0, err
	}
	version, err := c.commit(cfg, actor, release, target)
	if err != nil {
		return 0, err
	}
	c.audit(actor, "rollback", schema.ConfigVersions, fmt.Sprint(version), map[string]any{"note": release.note(), "rollbackOf": target})
	return version, nil
}

// compile builds cfg for the data plane with its shared plugin environment and the master key.
func (c *Control) compile(cfg snapshot.Config) (*snapshot.Routes, error) {
	return snapshot.Compile(cfg, c.handler.Env(), c.open)
}

// precheck refuses to publish routes to a service without a healthy instance in
// the default stage, which serves every request without X-Ca-Stage, unless forced
// with a reason.
func (c *Control) precheck(cfg snapshot.Config, release Release) error {
	if release.Force {
		if strings.TrimSpace(release.Reason) == "" {
			return errors.New("a forced publish needs a reason")
		}
		return nil
	}
	names := map[string]string{}
	for _, service := range cfg.Services {
		names[service.ID] = service.Name
	}
	var errs []error
	now := time.Now()
	for _, id := range cfg.RoutedServices() {
		if healthy, _ := c.handler.Endpoints().Healthy(id, proxy.DefaultStage, now); healthy == 0 {
			errs = append(errs, fmt.Errorf("service %q has no healthy %s instance; publish with force and a reason to proceed", names[id], proxy.DefaultStage))
		}
	}
	return errors.Join(errs...)
}

// commit compiles cfg as the next version, stores it, activates the operations it
// serves, writes the last-known-good file and only then swaps the data plane.
func (c *Control) commit(cfg snapshot.Config, actor string, release Release, rollbackOf int) (int, error) {
	note := release.note()
	latest, err := c.latestVersion()
	if err != nil {
		return 0, err
	}
	cfg.Version = latest + 1
	routes, err := c.compile(cfg)
	if err != nil {
		return 0, err
	}
	if err := c.precheck(cfg, release); err != nil {
		return 0, err
	}
	err = c.app.RunInTransaction(func(txApp core.App) error {
		collection, err := txApp.FindCollectionByNameOrId(schema.ConfigVersions)
		if err != nil {
			return err
		}
		record := core.NewRecord(collection)
		record.Load(map[string]any{"version": cfg.Version, "config": cfg, "note": note, "publishedBy": actor, "rollbackOf": rollbackOf})
		if err := txApp.Save(record); err != nil {
			return err
		}
		return activate(txApp, cfg)
	})
	if err != nil {
		return 0, err
	}
	if err := c.writeLastKnownGood(cfg); err != nil {
		c.app.Logger().Error("Last-known-good snapshot not written", "error", err.Error())
	}
	c.handler.SetRoutes(routes)
	return cfg.Version, nil
}

func activate(txApp core.App, cfg snapshot.Config) error {
	for _, route := range cfg.Routes {
		for _, op := range route.Operations {
			record, err := txApp.FindRecordById(schema.Operations, op.ID)
			if err != nil {
				continue // a rollback may serve operations that were since deleted
			}
			if record.GetString("status") == "pending" {
				record.Set("status", "active")
				if err := txApp.Save(record); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

func (c *Control) latestVersion() (int, error) {
	var latest int
	err := c.app.DB().Select("coalesce(max(version), 0)").From(schema.ConfigVersions).Row(&latest)
	return latest, err
}

// collect reads the editable collections into a configuration, rejecting
// routes that point at operations no longer offered by their service.
func (c *Control) collect() (snapshot.Config, error) {
	var cfg snapshot.Config
	sites, err := c.app.FindAllRecords(schema.Sites)
	if err != nil {
		return cfg, err
	}
	for _, site := range sites {
		var hosts []string
		if err := site.UnmarshalJSONField("hosts", &hosts); err != nil {
			return cfg, fmt.Errorf("site %q: hosts must be a list of host names", site.GetString("name"))
		}
		cfg.Sites = append(cfg.Sites, snapshot.Site{ID: site.Id, Name: site.GetString("name"), Hosts: hosts})
	}
	services, err := c.app.FindAllRecords(schema.Services)
	if err != nil {
		return cfg, err
	}
	for _, record := range services {
		service := snapshot.Service{ID: record.Id, Name: record.GetString("name"), Timeouts: timeoutsOf(record),
			Balancer: record.GetString("balancer"), HashBy: record.GetString("hashBy"), PassiveFailures: record.GetInt("passiveFailures")}
		if path := record.GetString("healthPath"); path != "" {
			service.Health = &snapshot.HealthCheck{Path: path, IntervalSeconds: max(record.GetInt("healthIntervalSeconds"), 1),
				Threshold: max(record.GetInt("healthThreshold"), 1)}
		}
		cfg.Services = append(cfg.Services, service)
	}
	routes, err := c.app.FindAllRecords(schema.Routes, dbx.HashExp{"enabled": true})
	if err != nil {
		return cfg, err
	}
	var errs []error
	for _, route := range routes {
		ops, err := c.routeOperations(route)
		if err != nil {
			errs = append(errs, fmt.Errorf("route %q: %w", route.GetString("name"), err))
			continue
		}
		cfg.Routes = append(cfg.Routes, snapshot.Route{ID: route.Id, Name: route.GetString("name"),
			Site: route.GetString("site"), Service: route.GetString("service"), Operations: ops, Timeouts: timeoutsOf(route)})
	}
	if err := c.collectPolicies(&cfg); err != nil {
		errs = append(errs, err)
	}
	return cfg, errors.Join(errs...)
}

func timeoutsOf(record *core.Record) snapshot.Timeouts {
	return snapshot.Timeouts{HeaderTimeoutMs: record.GetInt("headerTimeoutMs"), TimeoutMs: record.GetInt("timeoutMs"),
		IdleTimeoutMs: record.GetInt("idleTimeoutMs")}
}

// collectPolicies adds plugin bindings, enabled consumers and sealed secrets.
func (c *Control) collectPolicies(cfg *snapshot.Config) error {
	consumers, err := c.app.FindAllRecords(schema.Consumers, dbx.HashExp{"enabled": true})
	if err != nil {
		return err
	}
	for _, consumer := range consumers {
		cfg.Consumers = append(cfg.Consumers, snapshot.Consumer{ID: consumer.Id, Name: consumer.GetString("name"),
			AppKey: consumer.GetString("appKey"), Secret: consumer.GetString("appSecret")})
	}
	secrets, err := c.app.FindAllRecords(schema.Secrets)
	if err != nil {
		return err
	}
	for _, secret := range secrets {
		if cfg.Secrets == nil {
			cfg.Secrets = map[string]string{}
		}
		cfg.Secrets[secret.GetString("name")] = secret.GetString("value")
	}
	bindings, err := c.app.FindRecordsByFilter(schema.PluginBindings, "", "created", 0, 0)
	if err != nil {
		return err
	}
	var errs []error
	for _, record := range bindings {
		binding := snapshot.Binding{Scope: record.GetString("scope")}
		binding.Plugin, binding.Priority, binding.Disabled = record.GetString("plugin"), record.GetInt("priority"), !record.GetBool("enabled")
		if raw := record.GetString("config"); raw != "" && raw != "null" {
			binding.Config = []byte(raw)
		}
		if binding.Scope != "global" {
			binding.Target = record.GetString(binding.Scope)
			if binding.Target == "" {
				errs = append(errs, fmt.Errorf("binding of %s at %s level names no %s", binding.Plugin, binding.Scope, binding.Scope))
				continue
			}
		}
		cfg.Bindings = append(cfg.Bindings, binding)
	}
	return errors.Join(errs...)
}

func (c *Control) routeOperations(route *core.Record) ([]snapshot.Operation, error) {
	service := route.GetString("service")
	// Discovery only offers operations; a route exposes exactly the ones an
	// operator selected, so an operation a service adds is never public by default.
	selected := route.GetStringSlice("operations")
	if len(selected) == 0 {
		return nil, errors.New("selects no operations; pick the discovered operations it exposes")
	}
	records, err := c.app.FindRecordsByIds(schema.Operations, selected)
	if err == nil && len(records) != len(selected) {
		err = errors.New("selects operations that no longer exist")
	}
	if err != nil {
		return nil, err
	}
	ops := make([]snapshot.Operation, 0, len(records))
	for _, record := range records {
		pattern := record.GetString("method") + " " + record.GetString("path")
		switch {
		case record.GetString("service") != service:
			return nil, fmt.Errorf("operation %s belongs to another service", pattern)
		case record.GetString("status") == "removed":
			return nil, fmt.Errorf("operation %s was removed from the service manifest", pattern)
		}
		ops = append(ops, snapshot.Operation{ID: record.Id, Method: record.GetString("method"), Path: record.GetString("path"),
			Module: record.GetString("module"), Auth: record.GetString("auth"), Idempotent: record.GetBool("idempotent")})
	}
	return ops, nil
}

// loadRoutes serves the latest published version, else the last-known-good
// file, else nothing (every request answers 404 until the first publish).
func (c *Control) loadRoutes() {
	routes, err := c.loadLatest()
	if err == nil {
		c.handler.SetRoutes(routes)
		return
	}
	if !errors.Is(err, errNoVersion) {
		c.app.Logger().Error("Published configuration not loaded; trying last-known-good", "error", err.Error())
	}
	raw, fileErr := os.ReadFile(filepath.Join(c.app.DataDir(), lastKnownGood))
	var cfg snapshot.Config
	if fileErr == nil {
		fileErr = json.Unmarshal(raw, &cfg)
	}
	if fileErr == nil {
		routes, fileErr = c.compile(cfg)
	}
	if fileErr != nil {
		c.app.Logger().Warn("No routes to serve until the first publish", "reason", fileErr.Error())
		return
	}
	c.handler.SetRoutes(routes)
}

func (c *Control) loadLatest() (*snapshot.Routes, error) {
	latest, err := c.latestVersion()
	if err != nil {
		return nil, err
	}
	if latest == 0 {
		return nil, errNoVersion
	}
	record, err := c.app.FindFirstRecordByFilter(schema.ConfigVersions, "version = {:v}", dbx.Params{"v": latest})
	if err != nil {
		return nil, err
	}
	var cfg snapshot.Config
	if err := record.UnmarshalJSONField("config", &cfg); err != nil {
		return nil, err
	}
	return c.compile(cfg)
}

var errNoVersion = errors.New("no published version")

func (c *Control) writeLastKnownGood(cfg snapshot.Config) error {
	raw, err := json.Marshal(cfg)
	if err != nil {
		return err
	}
	path := filepath.Join(c.app.DataDir(), lastKnownGood)
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
