package control

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"kanyue.gateway/internal/config"
	"kanyue.gateway/internal/proxy"
	"kanyue.gateway/internal/schema"
	"kanyue.gateway/internal/snapshot"
)

const token = "registration-token-registration-token"

// testKeyEnv holds the test master key; tests never share it with anything else.
const testKeyEnv = "KANYUE_GATEWAY_TEST_KEY"

func newControl(t *testing.T) (*Control, *tests.TestApp) {
	t.Helper()
	t.Setenv(testKeyEnv, strings.Repeat("k", 32))
	app, err := tests.NewTestAppWithConfig(core.BaseAppConfig{EncryptionEnv: testKeyEnv})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	handler := proxy.New([]netip.Prefix{netip.MustParsePrefix("127.0.0.1/32")}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	c := New(app, config.Config{RegistrationToken: token}, handler)
	c.bindHooks()
	return c, app
}

// fakeService serves a manifest whose operations can change between pulls, and answers every other path with its name.
type fakeService struct {
	mu       sync.Mutex
	manifest string
	server   *httptest.Server
}

func newFakeService(t *testing.T, manifest string) *fakeService {
	f := &fakeService{manifest: manifest}
	f.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == defaultManifest {
			f.mu.Lock()
			defer f.mu.Unlock()
			io.WriteString(w, f.manifest)
			return
		}
		w.Header().Set("X-Upstream-Forwarded-For", r.Header.Get("X-Forwarded-For"))
		io.WriteString(w, "kanyue.server "+r.Method+" "+r.URL.Path)
	}))
	t.Cleanup(f.server.Close)
	return f
}

func (f *fakeService) set(manifest string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.manifest = manifest
}

func (f *fakeService) address() string { return strings.TrimPrefix(f.server.URL, "http://") }

const manifestV1 = `{"openapi":"3.1.0","info":{"title":"kanyue.server","version":"a"},"paths":{
	"/v1/student/appointments":{"get":{"x-kanyue-module":"booking","x-kanyue-auth":"student","x-kanyue-idempotent":true},
		"post":{"x-kanyue-module":"booking","x-kanyue-auth":"student"}},
	"/v1/public/course-catalog":{"get":{"x-kanyue-module":"catalog","x-kanyue-auth":"public","x-kanyue-idempotent":true},"parameters":[]}}}`

const manifestV2 = `{"openapi":"3.1.0","info":{"title":"kanyue.server","version":"b"},"paths":{
	"/v1/student/appointments":{"get":{"x-kanyue-module":"booking","x-kanyue-auth":"student","x-kanyue-idempotent":true}},
	"/{path...}":{"x-kanyue-any":{"x-kanyue-module":"console","x-kanyue-auth":"public"}}}}`

func create(t *testing.T, app core.App, collection string, data map[string]any) *core.Record {
	t.Helper()
	c, err := app.FindCollectionByNameOrId(collection)
	if err != nil {
		t.Fatal(err)
	}
	record := core.NewRecord(c)
	record.Load(data)
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
	return record
}

func statuses(t *testing.T, app core.App) map[string]string {
	t.Helper()
	records, err := app.FindAllRecords(schema.Operations)
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]string{}
	for _, record := range records {
		got[record.GetString("method")+" "+record.GetString("path")] = record.GetString("status")
	}
	return got
}

// selectable lists the operations of a service an operator could select now.
func selectable(t *testing.T, app core.App, service string) []string {
	t.Helper()
	records, err := app.FindAllRecords(schema.Operations, dbx.HashExp{"service": service}, dbx.Not(dbx.HashExp{"status": "removed"}))
	if err != nil {
		t.Fatal(err)
	}
	var ids []string
	for _, record := range records {
		ids = append(ids, record.Id)
	}
	return ids
}

func through(c *Control, method, target, stage string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(method, target, nil)
	request.RemoteAddr = "203.0.113.9:5000"
	if stage != "" {
		request.Header.Set("X-Ca-Stage", stage)
	}
	recorder := httptest.NewRecorder()
	c.handler.ServeHTTP(recorder, request)
	return recorder
}

// From a heartbeat to a served request: the service is discovered, its manifest
// becomes pending operations, publishing routes them and activates them, and the
// manifest shrinking marks operations removed without touching what is served.
func TestDiscoveryPublishAndServe(t *testing.T) {
	c, app := newControl(t)
	upstream := newFakeService(t, manifestV1)

	if err := c.Heartbeat(Beat{Service: "kanyue.server", Address: upstream.address(), Stage: "RELEASE", ManifestHash: "h1"}); err != nil {
		t.Fatal(err)
	}
	service, err := app.FindFirstRecordByData(schema.Services, "name", "kanyue.server")
	if err != nil || service.GetString("discovery") != "registry" {
		t.Fatalf("service = %v %v", service, err)
	}
	waitFor(t, func() bool { return len(statuses(t, app)) == 3 })
	if got := statuses(t, app); got["GET /v1/student/appointments"] != "pending" || got["GET /v1/public/course-catalog"] != "pending" {
		t.Fatalf("operations = %v", got)
	}
	if err := c.rebuildEndpoints(); err != nil {
		t.Fatal(err)
	}

	site := create(t, app, schema.Sites, map[string]any{"name": "mapi", "hosts": []string{"mapi.ikanyue.com"}})
	route := create(t, app, schema.Routes, map[string]any{"name": "server", "site": site.Id, "service": service.Id,
		"operations": selectable(t, app, service.Id), "enabled": true})
	version, err := c.Publish("ops@example.com", Release{Note: "first"})
	if err != nil || version != 1 {
		t.Fatalf("publish = %d %v", version, err)
	}
	if got := statuses(t, app); got["POST /v1/student/appointments"] != "active" {
		t.Fatalf("operations after publish = %v", got)
	}
	res := through(c, http.MethodPost, "http://mapi.ikanyue.com/v1/student/appointments", "")
	if res.Code != 200 || res.Body.String() != "kanyue.server POST /v1/student/appointments" ||
		res.Header().Get("X-Upstream-Forwarded-For") != "203.0.113.9" {
		t.Fatalf("proxied = %d %q %v", res.Code, res.Body.String(), res.Header())
	}
	if res := through(c, http.MethodGet, "http://mapi.ikanyue.com/ops/students", ""); res.Code != 404 {
		t.Fatalf("unpublished path = %d", res.Code)
	}
	if res := through(c, http.MethodGet, "http://mapi.ikanyue.com/v1/public/course-catalog", "TEST"); res.Code != 503 {
		t.Fatalf("stage without instances = %d", res.Code)
	}

	// The service ships a new manifest: one operation disappears, one appears.
	upstream.set(manifestV2)
	if err := c.SyncManifest(context.Background(), service.Id, upstream.address()); err != nil {
		t.Fatal(err)
	}
	got := statuses(t, app)
	if got["POST /v1/student/appointments"] != "removed" || got["GET /v1/public/course-catalog"] != "removed" ||
		got[" /{path...}"] != "pending" || got["GET /v1/student/appointments"] != "active" {
		t.Fatalf("operations after shrink = %v", got)
	}
	if res := through(c, http.MethodPost, "http://mapi.ikanyue.com/v1/student/appointments", ""); res.Code != 200 {
		t.Fatalf("published routes changed by discovery: %d", res.Code)
	}
	// Discovery never exposes anything: the route keeps its selection, so it
	// cannot publish while it selects removed operations, and the new catch-all
	// stays private until an operator selects it.
	if _, err := c.Publish("ops@example.com", Release{Note: "stale"}); err == nil || !strings.Contains(err.Error(), "removed from the service manifest") {
		t.Fatalf("published a route selecting removed operations: %v", err)
	}
	if res := through(c, http.MethodGet, "http://mapi.ikanyue.com/anything/else", ""); res.Code != 404 {
		t.Fatalf("a newly discovered operation was exposed: %d", res.Code)
	}
	route.Set("operations", selectable(t, app, service.Id))
	if err := app.Save(route); err != nil {
		t.Fatal(err)
	}
	if version, err := c.Publish("ops@example.com", Release{Note: "select the new operations"}); err != nil || version != 2 {
		t.Fatalf("second publish = %d %v", version, err)
	}
	route.Set("operations", []string{})
	if err := app.Save(route); err != nil {
		t.Fatal(err)
	}
	if _, err := c.Publish("ops@example.com", Release{}); err == nil || !strings.Contains(err.Error(), "selects no operations") {
		t.Fatalf("a route without a selection published: %v", err)
	}
	if res := through(c, http.MethodGet, "http://mapi.ikanyue.com/anything/else", ""); res.Code != 200 {
		t.Fatalf("catch-all = %d", res.Code)
	}
	if res := through(c, http.MethodGet, "http://mapi.ikanyue.com/v1/public/course-catalog", ""); res.Body.String() != "kanyue.server GET /v1/public/course-catalog" {
		t.Fatalf("catch-all serves removed paths through the upstream = %q", res.Body.String())
	}
	if _, err := os.Stat(filepath.Join(app.DataDir(), lastKnownGood)); err != nil {
		t.Fatalf("last-known-good: %v", err)
	}
}

// Invalid publishes change nothing; rollbacks become the next version; both are audited.
func TestPublishRejectsConflictsAndRollsBack(t *testing.T) {
	c, app := newControl(t)
	upstream := newFakeService(t, manifestV1)
	if err := c.Heartbeat(Beat{Service: "kanyue.server", Address: upstream.address()}); err != nil {
		t.Fatal(err)
	}
	service, _ := app.FindFirstRecordByData(schema.Services, "name", "kanyue.server")
	if err := c.SyncManifest(context.Background(), service.Id, upstream.address()); err != nil {
		t.Fatal(err)
	}
	if err := c.rebuildEndpoints(); err != nil {
		t.Fatal(err)
	}
	site := create(t, app, schema.Sites, map[string]any{"name": "mapi", "hosts": []string{"*"}})
	all := create(t, app, schema.Routes, map[string]any{"name": "all", "site": site.Id, "service": service.Id,
		"operations": selectable(t, app, service.Id), "enabled": true})
	if _, err := c.Publish("a", Release{Note: "v1"}); err != nil {
		t.Fatal(err)
	}

	catalog, err := app.FindFirstRecordByFilter(schema.Operations, "path = '/v1/public/course-catalog'")
	if err != nil {
		t.Fatal(err)
	}
	duplicate := create(t, app, schema.Routes, map[string]any{"name": "catalog", "site": site.Id, "service": service.Id,
		"operations": []string{catalog.Id}, "enabled": true})
	if _, err := c.Publish("a", Release{Note: "conflict"}); err == nil || !strings.Contains(err.Error(), `route "`) {
		t.Fatalf("conflict published: %v", err)
	}
	if latest, _ := c.latestVersion(); latest != 1 || c.handler.Version() != 1 {
		t.Fatalf("version after rejected publish = %d/%d", latest, c.handler.Version())
	}

	// A route that selects an operation the manifest dropped cannot publish.
	all.Set("enabled", false)
	if err := app.Save(all); err != nil {
		t.Fatal(err)
	}
	upstream.set(manifestV2)
	if err := c.SyncManifest(context.Background(), service.Id, upstream.address()); err != nil {
		t.Fatal(err)
	}
	if _, err := c.Publish("a", Release{Note: "stale"}); err == nil || !strings.Contains(err.Error(), "removed from the service manifest") {
		t.Fatalf("stale selection published: %v", err)
	}
	if err := app.Delete(duplicate); err != nil {
		t.Fatal(err)
	}
	if version, err := c.Publish("a", Release{Note: "nothing routed"}); err != nil || version != 2 {
		t.Fatalf("empty publish = %d %v", version, err)
	}
	if res := through(c, http.MethodGet, "http://any.host/v1/student/appointments", ""); res.Code != 404 {
		t.Fatalf("empty version serves = %d", res.Code)
	}

	version, err := c.Rollback("b", 1, Release{Note: "undo"})
	if err != nil || version != 3 || c.handler.Version() != 3 {
		t.Fatalf("rollback = %d %v", version, err)
	}
	if res := through(c, http.MethodGet, "http://any.host/v1/student/appointments", ""); res.Code != 200 {
		t.Fatalf("rolled back route = %d", res.Code)
	}
	record, _ := app.FindFirstRecordByFilter(schema.ConfigVersions, "version = 3")
	if record.GetInt("rollbackOf") != 1 || record.GetString("publishedBy") != "b" {
		t.Fatalf("rollback record = %v", record)
	}
	if _, err := c.Rollback("b", 9, Release{Note: ""}); err == nil {
		t.Fatal("rolled back to a missing version")
	}
	var actions []string
	if err := app.DB().Select("action").From(schema.AuditLogs).OrderBy("created ASC", "rowid ASC").Column(&actions); err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(actions, ","); got != "discover,publish,publish,rollback" {
		t.Fatalf("audit = %s", got)
	}

	// The published versions are gone; the data plane starts from the last-known-good file.
	if _, err := app.DB().NewQuery("DELETE FROM " + schema.ConfigVersions).Execute(); err != nil {
		t.Fatal(err)
	}
	c.handler.SetRoutes(nil)
	c.loadRoutes()
	if c.handler.Version() != 3 || through(c, http.MethodGet, "http://any.host/v1/student/appointments", "").Code != 200 {
		t.Fatalf("last-known-good not served: version %d", c.handler.Version())
	}
}

// Instances leave rotation when heartbeats stop, when they deregister, when DNS
// drops them, or while unconfirmed static entries; drained ones stay drained.
func TestInstanceLifecycle(t *testing.T) {
	c, app := newControl(t)
	beat := Beat{Service: "kanyue.server", Address: "127.0.0.1:1437", Stage: "release", Version: "abc"}
	if err := beat.normalize(); err != nil || beat.Stage != "RELEASE" {
		t.Fatalf("normalize = %v %s", err, beat.Stage)
	}
	for _, bad := range []Beat{{Service: "Kanyue", Address: "127.0.0.1:1"}, {Service: "s", Address: "no-port"}, {Service: "s", Address: "h:1", Stage: "te st"}} {
		if bad.normalize() == nil {
			t.Errorf("accepted %+v", bad)
		}
	}
	if err := c.Heartbeat(beat); err != nil {
		t.Fatal(err)
	}
	instance := func() *core.Record {
		record, err := app.FindFirstRecordByData(schema.Instances, "address", beat.Address)
		if err != nil {
			t.Fatal(err)
		}
		return record
	}
	if record := instance(); record.GetString("status") != "online" || record.GetString("version") != "abc" {
		t.Fatalf("registered = %v", record)
	}
	if err := c.Expire(time.Now().Add(time.Minute)); err != nil || instance().GetString("status") != "offline" {
		t.Fatalf("expired = %v %s", err, instance().GetString("status"))
	}
	if err := c.Heartbeat(beat); err != nil || instance().GetString("status") != "online" {
		t.Fatalf("revived = %v", err)
	}
	if err := c.Deregister(beat); err != nil || instance().GetString("status") != "offline" {
		t.Fatalf("deregistered = %v", err)
	}
	drained := instance()
	drained.Set("status", "drained")
	if err := app.Save(drained); err != nil {
		t.Fatal(err)
	}
	if err := c.Heartbeat(beat); err != nil || instance().GetString("status") != "drained" {
		t.Fatalf("drained instance revived by heartbeat")
	}

	dns := create(t, app, schema.Services, map[string]any{"name": "website", "discovery": "dns", "dnsName": "website.internal", "dnsPort": 3000})
	if err := c.Heartbeat(Beat{Service: "website", Address: "10.0.0.1:3000", Stage: "RELEASE"}); !errors.Is(err, errNotRegistry) {
		t.Fatalf("heartbeat into a DNS service = %v", err)
	}
	answers := []string{"10.0.0.1", "10.0.0.2"}
	lookup := func(_ context.Context, name string) ([]string, error) {
		if name != "website.internal" {
			return nil, errors.New("unexpected name")
		}
		return answers, nil
	}
	if err := c.ResolveDNS(context.Background(), lookup); err != nil {
		t.Fatal(err)
	}
	answers = []string{"10.0.0.2"}
	if err := c.ResolveDNS(context.Background(), lookup); err != nil {
		t.Fatal(err)
	}
	online, _ := app.FindAllRecords(schema.Instances, dbx.HashExp{"service": dns.Id, "status": "online"})
	if len(online) != 1 || online[0].GetString("address") != "10.0.0.2:3000" || online[0].GetString("stage") != "RELEASE" {
		t.Fatalf("dns instances = %v", online)
	}

	static := create(t, app, schema.Services, map[string]any{"name": "legacy", "discovery": "static"})
	entry := create(t, app, schema.Instances, map[string]any{"service": static.Id, "address": "10.0.0.7:80", "stage": "RELEASE",
		"source": "static", "status": "online"})
	if err := c.rebuildEndpoints(); err != nil {
		t.Fatal(err)
	}
	if _, ok := c.handler.Endpoints().Pick(&snapshot.Service{ID: static.Id}, "RELEASE", "", nil, time.Now()); ok {
		t.Fatal("unconfirmed static instance routed")
	}
	entry.Set("confirmed", true)
	if err := app.Save(entry); err != nil {
		t.Fatal(err)
	}
	if err := c.rebuildEndpoints(); err != nil {
		t.Fatal(err)
	}
	if target, ok := c.handler.Endpoints().Pick(&snapshot.Service{ID: static.Id}, "RELEASE", "", nil, time.Now()); !ok || target.Address != "10.0.0.7:80" {
		t.Fatal("confirmed static instance not routed")
	}
	if _, ok := c.handler.Endpoints().Pick(&snapshot.Service{ID: dns.Id}, "RELEASE", "", nil, time.Now()); !ok {
		t.Fatal("dns instance not routed")
	}
}

// The admin API needs a superuser, registration needs the token, and the admin
// plane refuses public addresses unless explicitly allowed.
func TestAdminAndRegistrationAccess(t *testing.T) {
	c, app := newControl(t)
	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	c.routes(&core.ServeEvent{App: app, Router: router})
	mux, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}
	call := func(method, path, auth, body string) *httptest.ResponseRecorder {
		request := httptest.NewRequest(method, path, strings.NewReader(body))
		request.Header.Set("Content-Type", "application/json")
		if auth != "" {
			request.Header.Set("Authorization", auth)
		}
		recorder := httptest.NewRecorder()
		mux.ServeHTTP(recorder, request)
		return recorder
	}
	beat := `{"service":"kanyue.pay","address":"127.0.0.1:1440"}`
	if res := call("POST", "/gateway/v1/heartbeat", "", beat); res.Code != 401 {
		t.Fatalf("anonymous heartbeat = %d", res.Code)
	}
	if res := call("POST", "/gateway/v1/heartbeat", "Bearer wrong", beat); res.Code != 401 {
		t.Fatalf("wrong token = %d", res.Code)
	}
	res := call("POST", "/gateway/v1/heartbeat", "Bearer "+token, beat)
	var answer map[string]int
	if res.Code != 200 || json.Unmarshal(res.Body.Bytes(), &answer) != nil || answer["expireSeconds"] != 30 {
		t.Fatalf("heartbeat = %d %s", res.Code, res.Body.String())
	}
	if res := call("POST", "/gateway/v1/heartbeat", "Bearer "+token, `{"service":"kanyue.pay","address":"nope"}`); res.Code != 400 {
		t.Fatalf("bad heartbeat = %d", res.Code)
	}
	if res := call("POST", "/gateway/v1/deregister", "Bearer "+token, beat); res.Code != 204 {
		t.Fatalf("deregister = %d", res.Code)
	}
	for _, path := range []string{"/gateway/v1/publish", "/gateway/v1/rollback"} {
		if res := call("POST", path, "", `{}`); res.Code != 401 {
			t.Fatalf("anonymous %s = %d", path, res.Code)
		}
	}
	superuser, err := app.FindAuthRecordByEmail(core.CollectionNameSuperusers, "test@example.com")
	if err != nil {
		t.Fatal(err)
	}
	session, err := superuser.NewAuthToken()
	if err != nil {
		t.Fatal(err)
	}
	if res := call("POST", "/gateway/v1/publish", session, `{"note":"empty"}`); res.Code != 200 || !strings.Contains(res.Body.String(), `"version":1`) {
		t.Fatalf("publish = %d %s", res.Code, res.Body.String())
	}
	if res := call("GET", "/gateway/v1/status", session, ""); res.Code != 200 || !strings.Contains(res.Body.String(), `"version":1`) {
		t.Fatalf("status = %d %s", res.Code, res.Body.String())
	}
	if res := call("POST", "/gateway/v1/rollback", session, `{"version":0}`); res.Code != 400 {
		t.Fatalf("rollback without version = %d", res.Code)
	}

	disabled := New(app, config.Config{}, c.handler)
	if disabled.authorized(&core.RequestEvent{}) {
		t.Fatal("registration open without a token")
	}

	for addr, ok := range map[string]bool{"127.0.0.1:1461": true, "10.0.0.2:1461": true, "localhost:1461": true,
		"0.0.0.0:1461": false, ":1461": false, "203.0.113.9:1461": false} {
		if err := c.checkAdminAddress(addr); (err == nil) != ok {
			t.Errorf("admin %s = %v", addr, err)
		}
	}
	c.cfg.AdminPublic = true
	if err := c.checkAdminAddress("0.0.0.0:1461"); err != nil {
		t.Fatalf("override = %v", err)
	}
}

func waitFor(t *testing.T, done func() bool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for !done() {
		if time.Now().After(deadline) {
			t.Fatal("timed out")
		}
		time.Sleep(10 * time.Millisecond)
	}
}
