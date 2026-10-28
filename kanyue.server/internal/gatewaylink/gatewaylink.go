// Package gatewaylink tells kanyue.gateway about this service: an internal-only
// OpenAPI manifest built from the router itself, and a heartbeat that registers
// this instance. kanyue.server and kanyue.pay carry identical copies of this
// file; the manifest and heartbeat JSON are the contract with the gateway.
package gatewaylink

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"net"
	"net/http"
	"net/netip"
	"reflect"
	"runtime/debug"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/router"
)

// ManifestPath is where the gateway pulls the manifest from.
const ManifestPath = "/internal/gateway/manifest"

// Route is one registered ServeMux pattern; Method is empty for any-method routes.
type Route struct {
	Method string
	Path   string
}

func (r Route) Pattern() string {
	if r.Method == "" {
		return r.Path
	}
	return r.Method + " " + r.Path
}

// Routes lists every route registered on r, including group prefixes. PocketBase
// keeps its route tree private, so this reads it by reflection; the error
// surfaces at startup and in tests if an upgrade changes that shape.
func Routes(r *router.Router[*core.RequestEvent]) ([]Route, error) {
	var routes []Route
	err := walk(reflect.ValueOf(r.RouterGroup).Elem(), "", &routes)
	return routes, err
}

func walk(group reflect.Value, prefix string, routes *[]Route) error {
	children := group.FieldByName("children")
	if !children.IsValid() || children.Kind() != reflect.Slice {
		return errors.New("gatewaylink: PocketBase router layout changed; routes cannot be listed")
	}
	prefix += group.FieldByName("Prefix").String()
	for i := 0; i < children.Len(); i++ {
		child := children.Index(i).Elem().Elem()
		if child.FieldByName("children").IsValid() {
			if err := walk(child, prefix, routes); err != nil {
				return err
			}
			continue
		}
		*routes = append(*routes, Route{Method: child.FieldByName("Method").String(), Path: prefix + child.FieldByName("Path").String()})
	}
	return nil
}

// Operation is a route as published to the gateway.
type Operation struct {
	Route
	Module string
	Auth   string
}

// Manifest renders operations as OpenAPI 3.1. Paths are the ServeMux patterns
// themselves; any-method routes use the x-kanyue-any key. Output is
// deterministic, so its hash changes only when the routes or version do.
func Manifest(title, version string, ops []Operation) []byte {
	paths := map[string]map[string]any{}
	for _, op := range ops {
		key := strings.ToLower(op.Method)
		if key == "" {
			key = "x-kanyue-any"
		}
		if paths[op.Path] == nil {
			paths[op.Path] = map[string]any{}
		}
		safe := op.Method == http.MethodGet || op.Method == http.MethodHead || op.Method == http.MethodOptions
		paths[op.Path][key] = map[string]any{"operationId": key + " " + op.Path, "x-kanyue-module": op.Module,
			"x-kanyue-auth": op.Auth, "x-kanyue-idempotent": safe}
	}
	doc := map[string]any{"openapi": "3.1.0", "info": map[string]any{"title": title, "version": version}, "paths": paths}
	raw, _ := json.Marshal(doc)
	return raw
}

// Hash is the manifest fingerprint the gateway compares heartbeats against.
func Hash(manifest []byte) string {
	sum := sha256.Sum256(manifest)
	return hex.EncodeToString(sum[:])
}

// ManifestHandler serves the manifest to internal callers and 404s everyone else.
func ManifestHandler(manifest []byte, internal func(*http.Request) bool) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		if !internal(e.Request) {
			return e.JSON(http.StatusNotFound, map[string]any{"code": 404, "message": "接口不存在", "data": nil})
		}
		e.Response.Header().Set("Content-Type", "application/json")
		e.Response.WriteHeader(http.StatusOK)
		_, err := e.Response.Write(manifest)
		return err
	}
}

// IsInternal is true for direct calls from loopback or private addresses that
// did not pass through a reverse proxy.
func IsInternal(r *http.Request) bool {
	if r.Header.Get("X-Forwarded-For") != "" || r.Header.Get("X-Real-IP") != "" || r.Header.Get("Forwarded") != "" {
		return false
	}
	addr, err := netip.ParseAddrPort(r.RemoteAddr)
	return err == nil && (addr.Addr().IsLoopback() || addr.Addr().IsPrivate())
}

// Version is the VCS revision the binary was built from, or "dev".
func Version() string {
	if info, ok := debug.ReadBuildInfo(); ok {
		for _, setting := range info.Settings {
			if setting.Key == "vcs.revision" && len(setting.Value) >= 12 {
				return setting.Value[:12]
			}
		}
	}
	return "dev"
}

// Registration is how this instance announces itself to the gateway.
type Registration struct {
	// URL is the gateway admin plane, e.g. http://127.0.0.1:1461.
	URL     string
	Token   string
	Service string
	// Address is where the gateway reaches this instance, e.g. 127.0.0.1:1437.
	Address string
	Stage   string
	// Gauges are read on every heartbeat, e.g. the outbox dead-letter backlog.
	Gauges map[string]func() (float64, error)
}

// RegistrationFromEnv reads GATEWAY_URL, GATEWAY_REGISTRATION_TOKEN,
// GATEWAY_INSTANCE_ADDRESS and GATEWAY_STAGE; without GATEWAY_URL the service
// does not register.
func RegistrationFromEnv(getenv func(string) string, service string) (*Registration, error) {
	reg := &Registration{URL: strings.TrimRight(getenv("GATEWAY_URL"), "/"), Token: getenv("GATEWAY_REGISTRATION_TOKEN"),
		Service: service, Address: getenv("GATEWAY_INSTANCE_ADDRESS"), Stage: getenv("GATEWAY_STAGE")}
	if reg.URL == "" {
		return nil, nil
	}
	if reg.Token == "" {
		return nil, errors.New("GATEWAY_REGISTRATION_TOKEN is required with GATEWAY_URL")
	}
	if _, _, err := net.SplitHostPort(reg.Address); err != nil {
		return nil, fmt.Errorf("GATEWAY_INSTANCE_ADDRESS must be host:port: %w", err)
	}
	return reg, nil
}

// Interval between heartbeats; the gateway takes an instance offline after three misses.
const Interval = 10 * time.Second

// Start sends heartbeats until the app terminates, then deregisters so the
// gateway stops routing here before the listener closes.
func Start(app core.App, reg Registration, manifest []byte) {
	client := &http.Client{Timeout: 3 * time.Second}
	identity := map[string]any{"service": reg.Service, "address": reg.Address, "stage": reg.Stage,
		"version": Version(), "manifestHash": Hash(manifest)}
	send := func(ctx context.Context, path string, fields map[string]any) error {
		body, _ := json.Marshal(fields)
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, reg.URL+path, bytes.NewReader(body))
		if err != nil {
			return err
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+reg.Token)
		res, err := client.Do(req)
		if err != nil {
			return err
		}
		res.Body.Close()
		if res.StatusCode != http.StatusOK && res.StatusCode != http.StatusNoContent {
			return fmt.Errorf("gateway answered %d", res.StatusCode)
		}
		return nil
	}

	ctx, cancel := context.WithCancel(context.Background())
	var done sync.WaitGroup
	done.Add(1)
	go func() {
		defer done.Done()
		ticker := time.NewTicker(Interval)
		defer ticker.Stop()
		var failing bool
		for {
			err := send(ctx, "/gateway/v1/heartbeat", reg.report(app, identity))
			switch {
			case err != nil && !failing && ctx.Err() == nil:
				app.Logger().Warn("Gateway heartbeat failing", "gateway", reg.URL, "error", err.Error())
			case err == nil && failing:
				app.Logger().Info("Gateway heartbeat recovered", "gateway", reg.URL)
			}
			failing = err != nil
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	}()
	app.OnTerminate().BindFunc(func(e *core.TerminateEvent) error {
		cancel()
		done.Wait()
		deregister, stop := context.WithTimeout(context.Background(), 2*time.Second)
		defer stop()
		if err := send(deregister, "/gateway/v1/deregister", identity); err != nil {
			app.Logger().Warn("Gateway deregistration failed", "error", err.Error())
		}
		return e.Next()
	})
}

// report is a heartbeat body: the identity plus outbound calls since the last
// beat, the gauges and the last backup. Calls drained into a beat the gateway
// never receives are lost; they are telemetry, not data.
func (reg Registration) report(app core.App, identity map[string]any) map[string]any {
	body := map[string]any{}
	maps.Copy(body, identity)
	body["outbound"] = calls.drain()
	gauges := map[string]float64{}
	for name, read := range reg.Gauges {
		value, err := read()
		if err != nil {
			app.Logger().Warn("Gateway gauge unreadable", "gauge", name, "error", err.Error())
			continue
		}
		gauges[name] = value
	}
	body["gauges"] = gauges
	if backup := lastBackup.Load(); backup != nil {
		body["backup"] = backup
	}
	return body
}

// LatencyBounds are the upper bounds in milliseconds of the latency buckets; the gateway uses the same.
var LatencyBounds = []float64{5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000}

// Outbound summarizes the calls to one target between two heartbeats.
type Outbound struct {
	Target   string  `json:"target"`
	Count    int     `json:"count"`
	Failures int     `json:"failures"`
	P95Ms    float64 `json:"p95Ms"`
}

type window struct {
	count, failures int
	buckets         []int
	max             float64
}

type tracker struct {
	mu      sync.Mutex
	targets map[string]*window
}

var calls = &tracker{targets: map[string]*window{}}

func (t *tracker) add(target string, took time.Duration, failed bool) {
	ms := float64(took) / float64(time.Millisecond)
	t.mu.Lock()
	defer t.mu.Unlock()
	w := t.targets[target]
	if w == nil {
		w = &window{buckets: make([]int, len(LatencyBounds)+1)}
		t.targets[target] = w
	}
	w.count++
	if failed {
		w.failures++
	}
	w.buckets[sort.SearchFloat64s(LatencyBounds, ms)]++
	w.max = max(w.max, ms)
}

func (t *tracker) drain() []Outbound {
	t.mu.Lock()
	targets := t.targets
	t.targets = map[string]*window{}
	t.mu.Unlock()
	out := []Outbound{}
	for target, w := range targets {
		p95, seen := w.max, 0
		for i, n := range w.buckets {
			if seen += n; seen*100 >= w.count*95 {
				if i < len(LatencyBounds) {
					p95 = min(LatencyBounds[i], w.max)
				}
				break
			}
		}
		out = append(out, Outbound{Target: target, Count: w.count, Failures: w.failures, P95Ms: p95})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Target < out[j].Target })
	return out
}

// Track wraps base (nil is http.DefaultTransport) so its calls are reported to
// the gateway as outbound calls to target; an error, a 5xx answer or a refused
// credential (401, 403) is a failure, other 4xx answers are the caller's business.
func Track(target string, base http.RoundTripper) http.RoundTripper {
	if base == nil {
		base = http.DefaultTransport
	}
	return tracked{target: target, base: base}
}

type tracked struct {
	target string
	base   http.RoundTripper
}

func (t tracked) RoundTrip(r *http.Request) (*http.Response, error) {
	begin := time.Now()
	res, err := t.base.RoundTrip(r)
	failed := err != nil || res.StatusCode >= http.StatusInternalServerError ||
		res.StatusCode == http.StatusUnauthorized || res.StatusCode == http.StatusForbidden
	calls.add(t.target, time.Since(begin), failed)
	return res, err
}

// Backup is the result of the last backup, as reported in heartbeats.
type Backup struct {
	At    time.Time `json:"at"`
	OK    bool      `json:"ok"`
	Name  string    `json:"name,omitempty"`
	Error string    `json:"error,omitempty"`
	Cron  string    `json:"cron,omitempty"`
}

var lastBackup atomic.Pointer[Backup]

// ConfigureBackups applies BACKUP_CRON, BACKUP_KEEP and BACKUP_S3_* (ENDPOINT,
// BUCKET, REGION, ACCESS_KEY, SECRET, FORCE_PATH_STYLE) to the PocketBase
// backup settings, then records every backup's result for the heartbeat.
// Without BACKUP_CRON the settings are left as edited in the dashboard. An S3
// secret is only stored in settings encrypted with --encryptionEnv.
func ConfigureBackups(app core.App, getenv func(string) string) error {
	if cron := getenv("BACKUP_CRON"); cron != "" {
		settings, err := app.Settings().Clone()
		if err != nil {
			return err
		}
		settings.Backups.Cron = cron
		settings.Backups.CronMaxKeep = 7
		if keep := getenv("BACKUP_KEEP"); keep != "" {
			if _, err := fmt.Sscan(keep, &settings.Backups.CronMaxKeep); err != nil || settings.Backups.CronMaxKeep < 1 {
				return errors.New("BACKUP_KEEP must be a positive number")
			}
		}
		if endpoint := getenv("BACKUP_S3_ENDPOINT"); endpoint != "" {
			if app.EncryptionEnv() == "" || getenv(app.EncryptionEnv()) == "" {
				return errors.New("S3 backups need --encryptionEnv naming a set key, so the S3 secret is stored encrypted")
			}
			settings.Backups.S3 = core.S3Config{Enabled: true, Endpoint: endpoint, Bucket: getenv("BACKUP_S3_BUCKET"),
				Region: getenv("BACKUP_S3_REGION"), AccessKey: getenv("BACKUP_S3_ACCESS_KEY"), Secret: getenv("BACKUP_S3_SECRET"),
				ForcePathStyle: getenv("BACKUP_S3_FORCE_PATH_STYLE") == "1"}
		}
		if err := app.Save(settings); err != nil {
			return fmt.Errorf("backup settings: %w", err)
		}
	}
	app.OnBackupCreate().BindFunc(func(e *core.BackupEvent) error {
		err := e.Next()
		backup := &Backup{At: time.Now().UTC(), OK: err == nil, Name: e.Name, Cron: e.App.Settings().Backups.Cron}
		if err != nil {
			backup.Error = err.Error()
			e.App.Logger().Error("Backup failed", "name", e.Name, "error", err.Error())
		}
		lastBackup.Store(backup)
		return err
	})
	// Until the next backup, the newest stored one stands for the last result.
	go func() {
		fsys, err := app.NewBackupsFilesystem()
		if err != nil {
			return
		}
		defer fsys.Close()
		objects, err := fsys.List("")
		if err != nil {
			return
		}
		var newest *Backup
		for _, object := range objects {
			if newest == nil || object.ModTime.After(newest.At) {
				newest = &Backup{At: object.ModTime.UTC(), OK: true, Name: object.Key, Cron: app.Settings().Backups.Cron}
			}
		}
		if newest != nil {
			lastBackup.CompareAndSwap(nil, newest)
		}
	}()
	return nil
}
