package control

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"maps"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"os"
	"slices"
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

func newHandler() *proxy.Handler {
	return proxy.New([]netip.Prefix{netip.MustParsePrefix("127.0.0.1/32")}, slog.New(slog.NewTextHandler(io.Discard, nil)))
}

func newControl(t *testing.T) (*Control, *tests.TestApp) {
	t.Helper()
	t.Setenv(testKeyEnv, strings.Repeat("k", 32))
	app, err := tests.NewTestAppWithConfig(core.BaseAppConfig{EncryptionEnv: testKeyEnv})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	c := New(app, config.Config{RegistrationToken: token}, newHandler())
	c.bindHooks()
	return c, app
}

// fakeService serves a manifest whose operations can change between pulls, and answers every other path with its name.
type fakeService struct {
	mu       sync.Mutex
	name     string
	manifest string
	server   *httptest.Server
}

func newFakeService(t *testing.T, manifest string) *fakeService {
	return newNamedService(t, "kanyue.server", manifest)
}

func newNamedService(t *testing.T, name, manifest string) *fakeService {
	f := &fakeService{name: name, manifest: manifest}
	f.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == defaultManifest {
			f.mu.Lock()
			defer f.mu.Unlock()
			io.WriteString(w, f.manifest)
			return
		}
		w.Header().Set("X-Upstream-Forwarded-For", r.Header.Get("X-Forwarded-For"))
		io.WriteString(w, f.name+" "+r.Method+" "+r.URL.Path)
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

// registered registers a fake service with its manifest synced and its instance routable.
func registered(t *testing.T, c *Control, app core.App, upstream *fakeService) *core.Record {
	t.Helper()
	if err := c.Heartbeat(Beat{Service: upstream.name, Address: upstream.address(), Stage: "RELEASE"}); err != nil {
		t.Fatal(err)
	}
	service, err := app.FindFirstRecordByData(schema.Services, "name", upstream.name)
	if err != nil {
		t.Fatal(err)
	}
	if err := c.SyncManifest(context.Background(), service.Id, upstream.address()); err != nil {
		t.Fatal(err)
	}
	if err := c.rebuildEndpoints(); err != nil {
		t.Fatal(err)
	}
	return service
}

// draftGroup creates a group on hosts with an API for every operation of service an operator could select now.
func draftGroup(t *testing.T, app core.App, name string, hosts []string, service string) (*core.Record, map[string]*core.Record) {
	t.Helper()
	group := create(t, app, schema.APIGroups, map[string]any{"name": name})
	for _, host := range hosts {
		create(t, app, schema.GroupDomains, map[string]any{"group": group.Id, "host": host})
	}
	ops, err := app.FindAllRecords(schema.Operations, dbx.HashExp{"service": service}, dbx.Not(dbx.HashExp{"status": "removed"}))
	if err != nil {
		t.Fatal(err)
	}
	apis := map[string]*core.Record{}
	for _, op := range ops {
		apis[patternOf(op)] = create(t, app, schema.APIs, map[string]any{"group": group.Id, "operation": op.Id,
			"name": APIName(op.GetString("method"), op.GetString("path")), "visibility": "public", "auth": "passthrough"})
	}
	return group, apis
}

// targetsOf names the group, if any, then the APIs in pattern order.
func targetsOf(group *core.Record, apis ...*core.Record) []Target {
	var targets []Target
	if group != nil {
		targets = append(targets, Target{Kind: "group", ID: group.Id})
	}
	for _, api := range apis {
		targets = append(targets, Target{Kind: "api", ID: api.Id})
	}
	return targets
}

func all(apis map[string]*core.Record) []*core.Record {
	var out []*core.Record
	for _, pattern := range slices.Sorted(maps.Keys(apis)) {
		out = append(out, apis[pattern])
	}
	return out
}

// release releases targets to stage; RELEASE gets a reason, as it differs from PRE.
func release(t *testing.T, c *Control, stage string, targets []Target) Result {
	t.Helper()
	result, err := c.Release("ops", Request{Stage: stage, Targets: targets, Reason: "test"})
	if err != nil {
		t.Fatal(err)
	}
	return result
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
// becomes pending operations, drafted APIs serve nothing until released, a
// release serves them in one environment only, and the manifest shrinking marks
// operations removed without touching what is served.
func TestDiscoveryReleaseAndServe(t *testing.T) {
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

	group, drafted := draftGroup(t, app, "mapi", []string{"mapi.ikanyue.com"}, service.Id)
	post := drafted["POST /v1/student/appointments"]
	if res := through(c, http.MethodPost, "http://mapi.ikanyue.com/v1/student/appointments", ""); res.Code != 404 {
		t.Fatalf("a draft was served: %d", res.Code)
	}
	if states, err := c.States(); err != nil || states["api:"+post.Id]["RELEASE"].Status != "unreleased" {
		t.Fatalf("states = %v %v", states, err)
	}
	if _, err := c.Release("ops", Request{Stage: "RELEASE", Targets: targetsOf(nil, post), Reason: "x"}); err == nil ||
		!strings.Contains(err.Error(), "release the group first") {
		t.Fatalf("an API was released without its group: %v", err)
	}
	var promotion *PromotionError
	if _, err := c.Release("ops", Request{Stage: "RELEASE", Targets: targetsOf(group, all(drafted)...)}); !errors.As(err, &promotion) ||
		len(promotion.Diffs) != 3 {
		t.Fatalf("RELEASE differing from PRE without a reason: %v", err)
	}
	result, err := c.Release("ops@example.com", Request{Stage: "RELEASE", Targets: targetsOf(group, all(drafted)...), Note: "first", Reason: "cutover"})
	if err != nil || result.Version != 1 || len(result.Released) != 4 {
		t.Fatalf("release = %+v %v", result, err)
	}
	if got := statuses(t, app); got["POST /v1/student/appointments"] != "active" {
		t.Fatalf("operations after release = %v", got)
	}
	res := through(c, http.MethodPost, "http://mapi.ikanyue.com/v1/student/appointments", "")
	if res.Code != 200 || res.Body.String() != "kanyue.server POST /v1/student/appointments" ||
		res.Header().Get("X-Upstream-Forwarded-For") != "203.0.113.9" {
		t.Fatalf("proxied = %d %q %v", res.Code, res.Body.String(), res.Header())
	}
	if res := through(c, http.MethodGet, "http://mapi.ikanyue.com/ops/students", ""); res.Code != 404 {
		t.Fatalf("unreleased path = %d", res.Code)
	}
	if res := through(c, http.MethodGet, "http://mapi.ikanyue.com/v1/public/course-catalog", "DEV"); res.Code != 400 {
		t.Fatalf("unknown environment = %d", res.Code)
	}

	// Environments are released separately; TEST needs a TEST instance unless forced with a reason.
	if res := through(c, http.MethodGet, "http://mapi.ikanyue.com/v1/public/course-catalog", "TEST"); res.Code != 404 {
		t.Fatalf("TEST before its release = %d", res.Code)
	}
	test := Request{Stage: "TEST", Targets: targetsOf(group, all(drafted)...)}
	if _, err := c.Release("ops", test); err == nil || !strings.Contains(err.Error(), "no healthy TEST instance") {
		t.Fatalf("released to TEST without instances: %v", err)
	}
	test.Force = true
	if _, err := c.Release("ops", test); err == nil || !strings.Contains(err.Error(), "needs a reason") {
		t.Fatalf("forced without a reason: %v", err)
	}
	test.Reason = "TEST instances start later"
	if result, err := c.Release("ops", test); err != nil || result.Version != 1 {
		t.Fatalf("forced TEST release = %+v %v", result, err)
	}
	if res := through(c, http.MethodGet, "http://mapi.ikanyue.com/v1/public/course-catalog", "TEST"); res.Code != 503 {
		t.Fatalf("TEST without instances = %d", res.Code)
	}
	forced, err := app.FindFirstRecordByFilter(schema.Releases, "stage = 'TEST' && target = {:id}", dbx.Params{"id": post.Id})
	if err != nil || !forced.GetBool("forced") || forced.GetString("reason") != test.Reason {
		t.Fatalf("forced release record = %v %v", forced, err)
	}

	// Releasing what is served changes nothing; editing a draft changes nothing served.
	if result := release(t, c, "RELEASE", targetsOf(group, all(drafted)...)); result.Version != 0 || len(result.Unchanged) != 4 {
		t.Fatalf("unchanged release = %+v", result)
	}
	post.Set("timeoutMs", 1234)
	if err := app.Save(post); err != nil {
		t.Fatal(err)
	}
	if states, _ := c.States(); states["api:"+post.Id]["RELEASE"].Status != "changed" || states["group:"+group.Id]["RELEASE"].Status != "current" {
		t.Fatalf("states after an edit = %v", states)
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
		t.Fatalf("released APIs changed by discovery: %d", res.Code)
	}
	// Discovery never exposes anything: an API of a removed operation cannot be
	// released, and the new catch-all stays private until an API selects it.
	if _, err := c.Release("ops", Request{Stage: "RELEASE", Targets: targetsOf(nil, post), Reason: "x"}); err == nil ||
		!strings.Contains(err.Error(), "removed from the service manifest") {
		t.Fatalf("released an API of a removed operation: %v", err)
	}
	if res := through(c, http.MethodGet, "http://mapi.ikanyue.com/anything/else", ""); res.Code != 404 {
		t.Fatalf("a newly discovered operation was exposed: %d", res.Code)
	}
	op, err := app.FindFirstRecordByFilter(schema.Operations, "path = '/{path...}'")
	if err != nil {
		t.Fatal(err)
	}
	catchAll := create(t, app, schema.APIs, map[string]any{"group": group.Id, "operation": op.Id, "name": "any", "visibility": "public", "auth": "passthrough"})
	if result := release(t, c, "RELEASE", targetsOf(nil, catchAll)); result.Version != 2 {
		t.Fatalf("catch-all release = %+v", result)
	}
	if res := through(c, http.MethodGet, "http://mapi.ikanyue.com/anything/else", ""); res.Code != 200 {
		t.Fatalf("catch-all = %d", res.Code)
	}
	catalog := drafted["GET /v1/public/course-catalog"]
	if result, err := c.Offline("ops", Request{Stage: "RELEASE", Targets: targetsOf(nil, post, catalog)}); err != nil ||
		result.Version != 3 || !result.Released[0].Offline {
		t.Fatalf("offline = %+v %v", result, err)
	}
	if res := through(c, http.MethodGet, "http://mapi.ikanyue.com/v1/public/course-catalog", ""); res.Body.String() != "kanyue.server GET /v1/public/course-catalog" {
		t.Fatalf("catch-all serves removed paths through the upstream = %q", res.Body.String())
	}
	for _, stage := range []string{"RELEASE", "TEST"} {
		if _, err := os.Stat(lastKnownGoodFile(app.DataDir(), stage)); err != nil {
			t.Fatalf("last-known-good %s: %v", stage, err)
		}
	}
	if _, err := os.Stat(lastKnownGoodFile(app.DataDir(), "PRE")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("PRE was never released but has a file: %v", err)
	}
}

// Invalid releases change nothing; offline and rollback are new versions; all
// are audited; without released versions the last-known-good files are served.
func TestReleaseRejectsConflictsRollsBackAndRecovers(t *testing.T) {
	c, app := newControl(t)
	service := registered(t, c, app, newFakeService(t, manifestV1))
	group, drafted := draftGroup(t, app, "mapi", []string{"*"}, service.Id)
	release(t, c, "RELEASE", targetsOf(group, all(drafted)...))

	// Another service serving the same pattern in the same group conflicts.
	pay := registered(t, c, app, newNamedService(t, "kanyue.pay", manifestV1))
	payCatalog, err := app.FindFirstRecordByFilter(schema.Operations, "service = {:service} && path = '/v1/public/course-catalog'",
		dbx.Params{"service": pay.Id})
	if err != nil {
		t.Fatal(err)
	}
	duplicate := create(t, app, schema.APIs, map[string]any{"group": group.Id, "operation": payCatalog.Id, "name": "pay-catalog",
		"visibility": "public", "auth": "passthrough"})
	if _, err := c.Release("a", Request{Stage: "RELEASE", Targets: targetsOf(nil, duplicate), Reason: "x"}); err == nil ||
		!strings.Contains(err.Error(), "conflicts with API") || !strings.Contains(err.Error(), "pay-catalog") {
		t.Fatalf("conflict released: %v", err)
	}
	if v := c.handler.Versions()["RELEASE"]; v != 1 {
		t.Fatalf("version after a rejected release = %d", v)
	}
	if err := app.Delete(duplicate); err != nil {
		t.Fatal(err)
	}

	// A domain moved to another group conflicts until the first group is released without it.
	domain, err := app.FindFirstRecordByData(schema.GroupDomains, "host", "*")
	if err != nil {
		t.Fatal(err)
	}
	if err := app.Delete(domain); err != nil {
		t.Fatal(err)
	}
	other := create(t, app, schema.APIGroups, map[string]any{"name": "other"})
	create(t, app, schema.GroupDomains, map[string]any{"group": other.Id, "host": "*"})
	if _, err := c.Release("a", Request{Stage: "RELEASE", Targets: targetsOf(other)}); err == nil ||
		!strings.Contains(err.Error(), `domain "*" belongs to groups`) {
		t.Fatalf("a domain served by two groups: %v", err)
	}
	if err := app.Delete(other); err != nil {
		t.Fatal(err)
	}
	create(t, app, schema.GroupDomains, map[string]any{"group": group.Id, "host": "*"})

	catalog := drafted["GET /v1/public/course-catalog"]
	offline, err := c.Offline("a", Request{Stage: "RELEASE", Targets: targetsOf(nil, catalog), Note: "pause"})
	if err != nil || offline.Version != 2 || offline.Released[0].Version != 2 {
		t.Fatalf("offline = %+v %v", offline, err)
	}
	if res := through(c, http.MethodGet, "http://any.host/v1/public/course-catalog", ""); res.Code != 404 {
		t.Fatalf("offline API serves = %d", res.Code)
	}
	if _, err := c.Offline("a", Request{Stage: "RELEASE", Targets: []Target{{Kind: "api", ID: "nope"}}}); err == nil ||
		!strings.Contains(err.Error(), "is not served") {
		t.Fatalf("took an unserved API offline: %v", err)
	}
	rolled, err := c.Rollback("b", Request{Stage: "RELEASE", Targets: targetsOf(nil, catalog), Note: "undo"}, 1)
	if err != nil || rolled.Version != 3 || rolled.Released[0].Version != 3 || c.handler.Versions()["RELEASE"] != 3 {
		t.Fatalf("rollback = %+v %v", rolled, err)
	}
	if res := through(c, http.MethodGet, "http://any.host/v1/public/course-catalog", ""); res.Code != 200 {
		t.Fatalf("rolled back API = %d", res.Code)
	}
	record, err := app.FindFirstRecordByFilter(schema.Releases, "target = {:id} && version = 3", dbx.Params{"id": catalog.Id})
	if err != nil || record.GetInt("rollbackOf") != 1 || record.GetString("actor") != "b" || record.GetInt("previousVersion") != 2 {
		t.Fatalf("rollback record = %v %v", record, err)
	}
	if _, err := c.Rollback("b", Request{Stage: "RELEASE", Targets: targetsOf(nil, catalog)}, 9); err == nil {
		t.Fatal("rolled back to a missing version")
	}
	var actions []string
	if err := app.DB().Select("action").From(schema.AuditLogs).Where(dbx.HashExp{"resource": schema.Releases}).
		OrderBy("created ASC", "rowid ASC").Column(&actions); err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(actions, ","); got != "release,offline,rollback" {
		t.Fatalf("audit = %s", got)
	}

	// The released versions are gone; a restarted gateway serves the last-known-good files.
	if _, err := app.DB().NewQuery("DELETE FROM " + schema.StageVersions).Execute(); err != nil {
		t.Fatal(err)
	}
	restarted := New(app, config.Config{RegistrationToken: token}, newHandler())
	if err := restarted.rebuildEndpoints(); err != nil {
		t.Fatal(err)
	}
	restarted.loadRoutes()
	if restarted.handler.Versions()["RELEASE"] != 3 || through(restarted, http.MethodGet, "http://any.host/v1/public/course-catalog", "").Code != 200 {
		t.Fatalf("last-known-good not served: %v", restarted.handler.Versions())
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
	for _, path := range []string{"/gateway/v1/release", "/gateway/v1/offline", "/gateway/v1/rollback", "/gateway/v1/preview", "/gateway/v1/impact"} {
		if res := call("POST", path, "", `{}`); res.Code != 401 {
			t.Fatalf("anonymous %s = %d", path, res.Code)
		}
	}
	for _, path := range []string{"/gateway/v1/states", "/gateway/v1/apis/x/effective"} {
		if res := call("GET", path, "", ""); res.Code != 401 {
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
	group := create(t, app, schema.APIGroups, map[string]any{"name": "mapi"})
	create(t, app, schema.GroupDomains, map[string]any{"group": group.Id, "host": "mapi.ikanyue.com"})
	body := `{"stage":"TEST","targets":[{"kind":"group","id":"` + group.Id + `"}],"note":"first"}`
	if res := call("POST", "/gateway/v1/preview", session, body); res.Code != 200 || !strings.Contains(res.Body.String(), `"name":"mapi"`) {
		t.Fatalf("preview = %d %s", res.Code, res.Body.String())
	}
	if res := call("POST", "/gateway/v1/release", session, body); res.Code != 200 || !strings.Contains(res.Body.String(), `"version":1`) {
		t.Fatalf("release = %d %s", res.Code, res.Body.String())
	}
	if res := call("POST", "/gateway/v1/release", session, `{"stage":"TEST","targets":[]}`); res.Code != 422 {
		t.Fatalf("release without targets = %d", res.Code)
	}
	if res := call("GET", "/gateway/v1/status", session, ""); res.Code != 200 || !strings.Contains(res.Body.String(), `"TEST":1`) {
		t.Fatalf("status = %d %s", res.Code, res.Body.String())
	}
	if res := call("GET", "/gateway/v1/states", session, ""); res.Code != 200 || !strings.Contains(res.Body.String(), `"group:`+group.Id+`"`) {
		t.Fatalf("states = %d %s", res.Code, res.Body.String())
	}
	if res := call("POST", "/gateway/v1/rollback", session, `{"version":0}`); res.Code != 400 {
		t.Fatalf("rollback without version = %d", res.Code)
	}
	// Released history is append-only, and the old model is read-only.
	if res := call("DELETE", "/api/collections/"+schema.StageVersions+"/records/x", session, ""); res.Code < 400 {
		t.Fatalf("deleted a released version = %d", res.Code)
	}
	if res := call("POST", "/api/collections/"+schema.Sites+"/records", session, `{"name":"x","hosts":["x.com"]}`); res.Code < 400 {
		t.Fatalf("created a site = %d", res.Code)
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
