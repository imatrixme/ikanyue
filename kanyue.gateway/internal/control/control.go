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
	"sync"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
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
		server, err := proxy.Serve(c.cfg.Listen, c.handler, func(err error) {
			c.app.Logger().Error("Data plane stopped", "error", err.Error())
		})
		if err != nil {
			return fmt.Errorf("data plane: %w", err)
		}
		ctx, cancel := context.WithCancel(context.Background())
		go c.loop(ctx)
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

func (c *Control) routes(se *core.ServeEvent) {
	admin := se.Router.Group("/gateway/v1")
	admin.POST("/publish", c.publishRoute).Bind(apis.RequireSuperuserAuth())
	admin.POST("/rollback", c.rollbackRoute).Bind(apis.RequireSuperuserAuth())
	admin.GET("/status", c.statusRoute).Bind(apis.RequireSuperuserAuth())
	admin.POST("/heartbeat", c.heartbeatRoute)
	admin.POST("/deregister", c.deregisterRoute)
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

// Publish compiles the current collections into the next version and serves it.
func (c *Control) Publish(actor, note string) (int, error) {
	c.publishMu.Lock()
	defer c.publishMu.Unlock()
	cfg, err := c.collect()
	if err != nil {
		return 0, err
	}
	version, err := c.commit(cfg, actor, note, 0)
	if err != nil {
		return 0, err
	}
	c.audit(actor, "publish", schema.ConfigVersions, fmt.Sprint(version), map[string]any{"note": note})
	return version, nil
}

// Rollback republishes an earlier version as the next version.
func (c *Control) Rollback(actor string, target int, note string) (int, error) {
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
	version, err := c.commit(cfg, actor, note, target)
	if err != nil {
		return 0, err
	}
	c.audit(actor, "rollback", schema.ConfigVersions, fmt.Sprint(version), map[string]any{"note": note, "rollbackOf": target})
	return version, nil
}

// commit compiles cfg as the next version, stores it, activates the operations it
// serves, writes the last-known-good file and only then swaps the data plane.
func (c *Control) commit(cfg snapshot.Config, actor, note string, rollbackOf int) (int, error) {
	latest, err := c.latestVersion()
	if err != nil {
		return 0, err
	}
	cfg.Version = latest + 1
	routes, err := snapshot.Compile(cfg)
	if err != nil {
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
	for _, service := range services {
		cfg.Services = append(cfg.Services, snapshot.Service{ID: service.Id, Name: service.GetString("name"),
			HeaderTimeoutMs: service.GetInt("headerTimeoutMs")})
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
			Site: route.GetString("site"), Service: route.GetString("service"), Operations: ops})
	}
	return cfg, errors.Join(errs...)
}

func (c *Control) routeOperations(route *core.Record) ([]snapshot.Operation, error) {
	service := route.GetString("service")
	selected := route.GetStringSlice("operations")
	var records []*core.Record
	var err error
	if len(selected) == 0 {
		records, err = c.app.FindRecordsByFilter(schema.Operations, "service = {:s} && status != 'removed'", "path,method", 0, 0,
			dbx.Params{"s": service})
	} else {
		records, err = c.app.FindRecordsByIds(schema.Operations, selected)
		if err == nil && len(records) != len(selected) {
			err = errors.New("selects operations that no longer exist")
		}
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
		routes, fileErr = snapshot.Compile(cfg)
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
	return snapshot.Compile(cfg)
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

func (c *Control) publishRoute(e *core.RequestEvent) error {
	var body struct {
		Note string `json:"note"`
	}
	if err := e.BindBody(&body); err != nil {
		return e.BadRequestError("Invalid body.", err)
	}
	version, err := c.Publish(actorOf(e.Auth), body.Note)
	if err != nil {
		return e.JSON(http.StatusUnprocessableEntity, map[string]any{"error": err.Error()})
	}
	return e.JSON(http.StatusOK, map[string]any{"version": version})
}

func (c *Control) rollbackRoute(e *core.RequestEvent) error {
	var body struct {
		Version int    `json:"version"`
		Note    string `json:"note"`
	}
	if err := e.BindBody(&body); err != nil || body.Version < 1 {
		return e.BadRequestError("A version to roll back to is required.", err)
	}
	version, err := c.Rollback(actorOf(e.Auth), body.Version, body.Note)
	if err != nil {
		return e.JSON(http.StatusUnprocessableEntity, map[string]any{"error": err.Error()})
	}
	return e.JSON(http.StatusOK, map[string]any{"version": version, "rollbackOf": body.Version})
}

func (c *Control) statusRoute(e *core.RequestEvent) error {
	var online int
	err := c.app.DB().Select("count(*)").From(schema.Instances).Where(dbx.HashExp{"status": "online"}).Row(&online)
	if err != nil {
		return err
	}
	return e.JSON(http.StatusOK, map[string]any{"version": c.handler.Version(), "onlineInstances": online})
}
