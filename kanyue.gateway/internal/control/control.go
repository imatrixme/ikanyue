// Package control is the gateway's control plane on the embedded PocketBase:
// it keeps edits to API groups, APIs and policies as drafts, releases them per
// environment into versioned snapshots, keeps the endpoint table in step with
// discovery, and exposes the admin and registration API. The data plane only
// ever sees whole environments.
package control

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"net"
	"net/http"
	"net/netip"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"kanyue.gateway/internal/config"
	"kanyue.gateway/internal/policy"
	"kanyue.gateway/internal/proxy"
	"kanyue.gateway/internal/schema"
	"kanyue.gateway/internal/snapshot"
)

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
		if err := c.migrateLegacy(); err != nil {
			return fmt.Errorf("migrating sites and routes to API groups: %w", err)
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
		c.app.Logger().Info("Data plane listening", "addr", c.cfg.Listen, "versions", c.handler.Versions())
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
	c.bindValidation()
	schedule := func(e *core.RecordEvent) error {
		c.scheduleRebuild()
		return e.Next()
	}
	c.app.OnRecordAfterCreateSuccess(schema.Instances, schema.Services).BindFunc(schedule)
	c.app.OnRecordAfterUpdateSuccess(schema.Instances, schema.Services).BindFunc(schedule)
	c.app.OnRecordAfterDeleteSuccess(schema.Instances, schema.Services).BindFunc(schedule)

	// Admin edits are audited with what they changed; secrets appear only as fingerprints.
	audit := func(action string) func(e *core.RecordRequestEvent) error {
		return func(e *core.RecordRequestEvent) error {
			var before map[string]any
			switch action {
			case "update":
				before = e.Record.Original().PublicExport()
			case "delete":
				before = e.Record.PublicExport()
			}
			if err := e.Next(); err != nil {
				return err
			}
			var after map[string]any
			if action != "delete" {
				after = e.Record.PublicExport()
			}
			c.auditChange(actorOf(e.Auth), action, e.Collection.Name, e.Record.Id, before, after)
			return nil
		}
	}
	c.app.OnRecordCreateRequest(schema.Audited...).BindFunc(audit("create"))
	c.app.OnRecordUpdateRequest(schema.Audited...).BindFunc(audit("update"))
	c.app.OnRecordDeleteRequest(schema.Audited...).BindFunc(audit("delete"))

	// The site and route model stays readable after the migration; releases,
	// environment versions and the audit log are written only by the control plane.
	readOnly := func(e *core.RecordRequestEvent) error {
		return e.ForbiddenError("This collection is read-only; edit API groups and release them instead.", nil)
	}
	locked := append(slices.Clone(schema.Legacy), schema.AppendOnly...)
	c.app.OnRecordCreateRequest(locked...).BindFunc(readOnly)
	c.app.OnRecordUpdateRequest(locked...).BindFunc(readOnly)
	c.app.OnRecordDeleteRequest(locked...).BindFunc(readOnly)
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
	c.writeAudit(map[string]any{"actor": actor, "action": action, "resource": resource, "resourceId": resourceID, "detail": detail})
}

// auditChange records an edit with its before, after and field-level difference.
func (c *Control) auditChange(actor, action, resource, resourceID string, before, after map[string]any) {
	c.writeAudit(map[string]any{"actor": actor, "action": action, "resource": resource, "resourceId": resourceID,
		"before": before, "after": after, "diff": fieldDiff(before, after)})
}

func (c *Control) writeAudit(data map[string]any) {
	collection, err := c.app.FindCachedCollectionByNameOrId(schema.AuditLogs)
	if err == nil {
		record := core.NewRecord(collection)
		record.Load(data)
		err = c.app.Save(record)
	}
	if err != nil {
		c.app.Logger().Error("Audit write failed", "action", data["action"], "resource", data["resource"], "error", err.Error())
	}
}

// Change is one field's value before and after.
type Change struct {
	Before any `json:"before"`
	After  any `json:"after"`
}

// fieldDiff lists the top-level fields whose JSON differs; timestamps are left out.
func fieldDiff(before, after map[string]any) map[string]Change {
	out := map[string]Change{}
	keys := map[string]bool{}
	for key := range before {
		keys[key] = true
	}
	for key := range after {
		keys[key] = true
	}
	for _, key := range slices.Sorted(maps.Keys(keys)) {
		if key == "updated" || key == "created" {
			continue
		}
		b, _ := json.Marshal(before[key])
		a, _ := json.Marshal(after[key])
		if !bytes.Equal(b, a) {
			out[key] = Change{Before: before[key], After: after[key]}
		}
	}
	return out
}

// compile builds cfg for the data plane with its shared plugin environment and the master key.
func (c *Control) compile(cfg snapshot.Config) (*snapshot.Routes, error) {
	return snapshot.Compile(cfg, c.handler.Env(), c.open)
}

func timeoutsOf(record *core.Record) snapshot.Timeouts {
	return snapshot.Timeouts{HeaderTimeoutMs: record.GetInt("headerTimeoutMs"), TimeoutMs: record.GetInt("timeoutMs"),
		IdleTimeoutMs: record.GetInt("idleTimeoutMs")}
}

// environment reads what every environment shares and captures when it is
// released: services and their settings, enabled applications, sealed secrets.
func environment(app core.App) (snapshot.Config, error) {
	var cfg snapshot.Config
	services, err := app.FindAllRecords(schema.Services)
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
	consumers, err := app.FindRecordsByFilter(schema.Consumers, "enabled = true", "name", 0, 0)
	if err != nil {
		return cfg, err
	}
	for _, consumer := range consumers {
		cfg.Consumers = append(cfg.Consumers, snapshot.Consumer{ID: consumer.Id, Name: consumer.GetString("name"),
			AppKey: consumer.GetString("appKey"), Secret: consumer.GetString("appSecret")})
	}
	secrets, err := app.FindAllRecords(schema.Secrets)
	if err != nil {
		return cfg, err
	}
	for _, secret := range secrets {
		if cfg.Secrets == nil {
			cfg.Secrets = map[string]string{}
		}
		cfg.Secrets[secret.GetString("name")] = secret.GetString("value")
	}
	return cfg, nil
}

// loadRoutes serves each environment's latest released version, else its
// last-known-good file, else nothing (404 until its first release).
func (c *Control) loadRoutes() {
	for _, stage := range policy.Stages {
		routes, err := c.loadStage(stage)
		if err != nil && !errors.Is(err, errNoVersion) {
			c.app.Logger().Error("Released configuration not loaded; trying last-known-good", "stage", stage, "error", err.Error())
		}
		if err != nil {
			raw, fileErr := os.ReadFile(lastKnownGoodFile(c.app.DataDir(), stage))
			var cfg snapshot.Config
			if fileErr == nil {
				fileErr = json.Unmarshal(raw, &cfg)
			}
			if fileErr == nil {
				routes, fileErr = c.compile(cfg)
			}
			if fileErr != nil {
				if !errors.Is(fileErr, os.ErrNotExist) || !errors.Is(err, errNoVersion) {
					c.app.Logger().Warn("Environment serves nothing until its next release", "stage", stage, "reason", fileErr.Error())
				}
				continue
			}
		}
		if err := c.handler.SetStage(routes); err != nil {
			c.app.Logger().Error("Environment not served", "stage", stage, "error", err.Error())
		}
	}
}

func (c *Control) loadStage(stage string) (*snapshot.Routes, error) {
	record, err := latestStageVersion(c.app, stage)
	if err != nil {
		return nil, err
	}
	var cfg snapshot.Config
	if err := record.UnmarshalJSONField("config", &cfg); err != nil {
		return nil, err
	}
	return c.compile(cfg)
}

var errNoVersion = errors.New("no released version")

func latestStageVersion(app core.App, stage string) (*core.Record, error) {
	records, err := app.FindRecordsByFilter(schema.StageVersions, "stage = {:stage}", "-version", 1, 0, dbx.Params{"stage": stage})
	if err != nil {
		return nil, err
	}
	if len(records) == 0 {
		return nil, errNoVersion
	}
	return records[0], nil
}

func lastKnownGoodFile(dataDir, stage string) string {
	return filepath.Join(dataDir, "gateway-snapshot-"+strings.ToLower(stage)+".json")
}

func (c *Control) writeLastKnownGood(cfg snapshot.Config) error {
	raw, err := json.Marshal(cfg)
	if err != nil {
		return err
	}
	path := lastKnownGoodFile(c.app.DataDir(), cfg.Stage)
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
