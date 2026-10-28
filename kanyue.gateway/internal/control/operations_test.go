package control

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"kanyue.gateway/internal/schema"
)

type caller func(method, path, auth, body string) *httptest.ResponseRecorder

func adminAPI(t *testing.T, c *Control, app *tests.TestApp) (caller, string) {
	t.Helper()
	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	c.routes(&core.ServeEvent{App: app, Router: router})
	mux, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}
	superuser, err := app.FindAuthRecordByEmail(core.CollectionNameSuperusers, "test@example.com")
	if err != nil {
		t.Fatal(err)
	}
	session, err := superuser.NewAuthToken()
	if err != nil {
		t.Fatal(err)
	}
	return func(method, path, auth, body string) *httptest.ResponseRecorder {
		request := httptest.NewRequest(method, path, strings.NewReader(body))
		request.Header.Set("Content-Type", "application/json")
		if auth != "" {
			request.Header.Set("Authorization", auth)
		}
		recorder := httptest.NewRecorder()
		mux.ServeHTTP(recorder, request)
		return recorder
	}, session
}

func mint(t *testing.T, call caller, session, body string) string {
	t.Helper()
	res := call("POST", "/gateway/v1/tokens", session, body)
	var out struct {
		Token  string         `json:"token"`
		Record map[string]any `json:"record"`
	}
	if res.Code != 200 || json.Unmarshal(res.Body.Bytes(), &out) != nil || !strings.HasPrefix(out.Token, tokenPrefix) {
		t.Fatalf("mint %s = %d %s", body, res.Code, res.Body.String())
	}
	if _, leaked := out.Record["hash"]; leaked {
		t.Fatal("the token hash is returned")
	}
	return "Bearer " + out.Token
}

func audited(t *testing.T, app core.App, actor, action string) int {
	t.Helper()
	records, err := app.FindRecordsByFilter(schema.AuditLogs, "actor = {:actor} && action = {:action}", "", 0, 0,
		map[string]any{"actor": actor, "action": action})
	if err != nil {
		t.Fatal(err)
	}
	return len(records)
}

// Tokens carry a role and, for releasers, the environments they may release
// to; refusals are audited, and only a superuser mints tokens.
func TestMachineTokensAreScoped(t *testing.T) {
	c, app := newControl(t)
	call, session := adminAPI(t, c, app)
	upstream := newFakeService(t, manifestV1)
	service := registered(t, c, app, upstream)
	group, drafted := draftGroup(t, app, "mapi", []string{"mapi.ikanyue.com"}, service.Id)
	body := func(stage string) string {
		raw, _ := json.Marshal(Request{Stage: stage, Targets: targetsOf(group, all(drafted)...), Reason: "test", Force: true})
		return string(raw)
	}

	viewer := mint(t, call, session, `{"name":"dashboard","role":"viewer"}`)
	ci := mint(t, call, session, `{"name":"ci","role":"releaser","stages":["TEST","PRE"]}`)
	if res := call("POST", "/gateway/v1/tokens", session, `{"name":"bad","role":"releaser"}`); res.Code != 422 {
		t.Fatalf("releaser without environments = %d", res.Code)
	}
	if res := call("POST", "/gateway/v1/tokens", ci, `{"name":"more","role":"admin"}`); res.Code != 401 {
		t.Fatalf("a token minted a token = %d", res.Code)
	}
	if res := call("POST", "/api/collections/"+schema.AdminTokens+"/records", session, `{"name":"x","role":"admin","hash":"x"}`); res.Code != 403 {
		t.Fatalf("token created through the collections API = %d", res.Code)
	}
	if res := call("POST", "/api/sql", session, `{"query":"DELETE FROM audit_logs"}`); res.Code != 403 {
		t.Fatalf("SQL console = %d %s", res.Code, res.Body.String())
	}

	if res := call("GET", "/gateway/v1/states", viewer, ""); res.Code != 200 {
		t.Fatalf("viewer reads states = %d", res.Code)
	}
	if res := call("POST", "/gateway/v1/release", viewer, body("TEST")); res.Code != 403 {
		t.Fatalf("viewer released = %d", res.Code)
	}
	if res := call("POST", "/gateway/v1/release", ci, body("TEST")); res.Code != 200 {
		t.Fatalf("releaser to TEST = %d %s", res.Code, res.Body.String())
	}
	if res := call("POST", "/gateway/v1/release", ci, body("RELEASE")); res.Code != 403 {
		t.Fatalf("releaser to RELEASE = %d", res.Code)
	}
	if res := call("POST", "/gateway/v1/config/apply?dryRun=1", ci, `{"version":1}`); res.Code != 403 {
		t.Fatalf("releaser applied config = %d", res.Code)
	}
	if got := audited(t, app, "token:ci", "refused"); got != 2 {
		t.Fatalf("refusals audited = %d", got)
	}
	if got := audited(t, app, "token:ci", "release"); got != 1 {
		t.Fatalf("token releases audited = %d", got)
	}
	if got := audited(t, app, "token:dashboard", "refused"); got != 1 {
		t.Fatalf("viewer refusals audited = %d", got)
	}
	record, err := app.FindFirstRecordByData(schema.AdminTokens, "name", "ci")
	if err != nil || record.GetDateTime("lastUsed").IsZero() {
		t.Fatalf("last use not recorded: %v", err)
	}

	// Expired and revoked tokens stop working.
	record.Set("expires", time.Now().Add(-time.Minute))
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
	if res := call("GET", "/gateway/v1/states", ci, ""); res.Code != 401 {
		t.Fatalf("expired token = %d", res.Code)
	}
	dashboard, _ := app.FindFirstRecordByData(schema.AdminTokens, "name", "dashboard")
	if res := call("DELETE", "/api/collections/"+schema.AdminTokens+"/records/"+dashboard.Id, session, ""); res.Code != 204 {
		t.Fatalf("revoke = %d", res.Code)
	}
	if res := call("GET", "/gateway/v1/states", viewer, ""); res.Code != 401 {
		t.Fatalf("revoked token = %d", res.Code)
	}
	if res := call("GET", "/gateway/v1/states", "Bearer "+tokenPrefix+"guess", ""); res.Code != 401 {
		t.Fatalf("unknown token = %d", res.Code)
	}
}

// With approval on, a release to RELEASE waits for a second identity, and an
// approval releases only what was requested.
func TestReleaseNeedsSecondApproval(t *testing.T) {
	c, app := newControl(t)
	c.cfg.ReleaseApproval = true
	call, session := adminAPI(t, c, app)
	upstream := newFakeService(t, manifestV1)
	service := registered(t, c, app, upstream)
	group, drafted := draftGroup(t, app, "mapi", []string{"mapi.ikanyue.com"}, service.Id)
	targets := targetsOf(group, all(drafted)...)
	forced(t, c, "TEST", targets) // other environments are not gated
	ci := mint(t, call, session, `{"name":"ci","role":"releaser","stages":["RELEASE"]}`)
	request := func() string {
		raw, _ := json.Marshal(Request{Stage: "RELEASE", Targets: targets, Reason: "first launch"})
		res := call("POST", "/gateway/v1/release", ci, string(raw))
		var out struct {
			Approval map[string]any `json:"approval"`
		}
		if res.Code != 202 || json.Unmarshal(res.Body.Bytes(), &out) != nil {
			t.Fatalf("request = %d %s", res.Code, res.Body.String())
		}
		return out.Approval["id"].(string)
	}

	id := request()
	if c.handler.Versions()["RELEASE"] != 0 {
		t.Fatal("released before approval")
	}
	if res := call("POST", "/gateway/v1/approvals/"+id+"/approve", ci, ""); res.Code != 422 || !strings.Contains(res.Body.String(), "second identity") {
		t.Fatalf("self approval = %d %s", res.Code, res.Body.String())
	}
	if res := call("POST", "/gateway/v1/approvals/"+id+"/approve", session, ""); res.Code != 200 {
		t.Fatalf("approve = %d %s", res.Code, res.Body.String())
	}
	if got := through(c, http.MethodGet, "http://mapi.ikanyue.com/v1/public/course-catalog", "").Code; got != 200 {
		t.Fatalf("served after approval = %d", got)
	}
	approval, _ := app.FindRecordById(schema.Approvals, id)
	if approval.GetString("status") != "approved" || approval.GetInt("stageVersion") != 1 || approval.GetString("approver") != "test@example.com" {
		t.Fatalf("approval = %v", approval.PublicExport())
	}
	if res := call("POST", "/gateway/v1/approvals/"+id+"/approve", session, ""); res.Code != 422 {
		t.Fatalf("approved twice = %d", res.Code)
	}

	// A draft edited after the request makes the request stale.
	api := drafted["GET /v1/public/course-catalog"]
	api.Set("timeoutMs", 5000)
	if err := app.Save(api); err != nil {
		t.Fatal(err)
	}
	id = request()
	api.Set("timeoutMs", 7000)
	if err := app.Save(api); err != nil {
		t.Fatal(err)
	}
	if res := call("POST", "/gateway/v1/approvals/"+id+"/approve", session, ""); res.Code != 422 || !strings.Contains(res.Body.String(), "changed") {
		t.Fatalf("stale approval = %d %s", res.Code, res.Body.String())
	}
	if c.handler.Versions()["RELEASE"] != 1 {
		t.Fatal("a stale approval released")
	}

	// The requester may withdraw; records stay read-only to the collections API.
	id = request()
	if res := call("POST", "/gateway/v1/approvals/"+id+"/reject", ci, ""); res.Code != 204 {
		t.Fatalf("withdraw = %d", res.Code)
	}
	if res := call("DELETE", "/api/collections/"+schema.Approvals+"/records/"+id, session, ""); res.Code != 403 {
		t.Fatalf("deleted an approval = %d", res.Code)
	}
}

// Exported drafts apply back unchanged; an edited file changes drafts only,
// and the same file again changes nothing.
func TestConfigFileRoundTrip(t *testing.T) {
	c, app := newControl(t)
	upstream := newFakeService(t, manifestV1)
	service := registered(t, c, app, upstream)
	group, drafted := draftGroup(t, app, "mapi", []string{"mapi.ikanyue.com"}, service.Id)
	partner := create(t, app, schema.Consumers, map[string]any{"name": "partner", "appKey": "partner-app-key", "appSecret": strings.Repeat("s", 32), "enabled": true})
	create(t, app, schema.Grants, map[string]any{"consumer": partner.Id, "group": group.Id})
	forced(t, c, "TEST", targetsOf(group, all(drafted)...))
	served := c.handler.Versions()

	file, err := c.ExportConfig()
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(file)
	if strings.Contains(string(raw), strings.Repeat("s", 32)) || strings.Contains(string(raw), sealedPrefix) {
		t.Fatal("the file carries a secret")
	}
	if changes, err := c.ApplyConfig("ops", file, false); err != nil || len(changes) != 0 {
		t.Fatalf("applying the export = %v %v", changes, err)
	}

	// Edit: tighten one API, drop another, add a domain and a policy set.
	edited := file
	mapi := &edited.Groups[0]
	mapi.Domains = append(mapi.Domains, FileDomain{Host: "m.ikanyue.com", FixedStage: "RELEASE"})
	var kept []FileAPI
	for _, api := range mapi.APIs {
		switch api.Operation {
		case "GET /v1/public/course-catalog":
			api.TimeoutMs, api.PolicySet = 3000, "strict"
		case "POST /v1/student/appointments":
			continue
		}
		kept = append(kept, api)
	}
	mapi.APIs = kept
	edited.PolicySets = append(edited.PolicySets, FilePolicySet{Name: "strict", Items: []any{}})

	dry, err := c.ApplyConfig("ops", edited, true)
	if err != nil {
		t.Fatal(err)
	}
	if again, _ := c.ExportConfig(); len(again.Groups[0].APIs) != 3 {
		t.Fatal("a dry run wrote")
	}
	changes, err := c.ApplyConfig("ops", edited, false)
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]bool{}
	for _, change := range changes {
		got[change.Action+" "+change.Resource+" "+change.Name] = true
	}
	for _, want := range []string{"create policySet strict", "create domain m.ikanyue.com", "update api mapi/get-v1-public-course-catalog",
		"delete api mapi/post-v1-student-appointments"} {
		if !got[want] {
			t.Errorf("missing change %q in %v", want, got)
		}
	}
	if len(changes) != 4 || len(dry) != len(changes) {
		t.Fatalf("changes = %v, dry run = %v", changes, dry)
	}
	if audited(t, app, "ops", "apply-config") != 1 {
		t.Fatal("apply not audited")
	}
	if versions := c.handler.Versions(); versions["TEST"] != served["TEST"] {
		t.Fatalf("an apply changed what is served: %v → %v", served, versions)
	}
	if changes, err := c.ApplyConfig("ops", edited, false); err != nil || len(changes) != 0 {
		t.Fatalf("applying twice = %v %v", changes, err)
	}

	// Applications stay in the console: a grant to an unknown one stops the apply.
	edited.Grants = append(edited.Grants, FileGrant{Consumer: "nobody", Group: "mapi"})
	if _, err := c.ApplyConfig("ops", edited, false); err == nil || !strings.Contains(err.Error(), "created in the console") {
		t.Fatalf("grant to an unknown application = %v", err)
	}
}

// Compare lists what two environments serve differently.
func TestCompareEnvironments(t *testing.T) {
	c, app := newControl(t)
	upstream := newFakeService(t, manifestV1)
	service := registered(t, c, app, upstream)
	group, drafted := draftGroup(t, app, "mapi", []string{"mapi.ikanyue.com"}, service.Id)
	forced(t, c, "TEST", targetsOf(group, all(drafted)...))
	forced(t, c, "PRE", targetsOf(group, all(drafted)...))
	if diffs, err := c.Compare("TEST", "PRE"); err != nil || len(diffs) != 0 {
		t.Fatalf("equal environments = %v %v", diffs, err)
	}
	api := drafted["GET /v1/public/course-catalog"]
	api.Set("timeoutMs", 3000)
	if err := app.Save(api); err != nil {
		t.Fatal(err)
	}
	forced(t, c, "TEST", targetsOf(nil, api))
	diffs, err := c.Compare("TEST", "PRE")
	if err != nil || len(diffs) != 1 || diffs[0].ID != api.Id || diffs[0].FromVersion != 2 || diffs[0].ToVersion != 1 || len(diffs[0].Diff) == 0 {
		t.Fatalf("diffs = %+v %v", diffs, err)
	}
	if diffs, _ := c.Compare("TEST", "RELEASE"); len(diffs) != 1+len(drafted) || diffs[0].Kind != "group" || diffs[0].ToVersion != 0 {
		t.Fatalf("against an empty environment = %+v", diffs)
	}
	if _, err := c.Compare("TEST", "TEST"); err == nil {
		t.Fatal("compared an environment with itself")
	}
}

// forced releases to an environment without healthy instances of its own.
func forced(t *testing.T, c *Control, stage string, targets []Target) {
	t.Helper()
	if _, err := c.Release("ops", Request{Stage: stage, Targets: targets, Reason: "test", Force: true}); err != nil {
		t.Fatal(err)
	}
}
