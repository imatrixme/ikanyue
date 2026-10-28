package control

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"kanyue.gateway/internal/policy"
	"kanyue.gateway/internal/schema"
	"kanyue.gateway/internal/snapshot"
)

func signedRequest(appKey, secret, nonce string) *http.Request {
	r := httptest.NewRequest(http.MethodGet, "http://mapi.ikanyue.com/v1/public/course-catalog", nil)
	r.RemoteAddr = "203.0.113.9:5000"
	stamp := fmt.Sprint(time.Now().UnixMilli())
	r.Header.Set("X-Ca-Key", appKey)
	r.Header.Set("X-Ca-Timestamp", stamp)
	r.Header.Set("X-Ca-Nonce", nonce)
	r.Header.Set("X-Ca-Signature-Headers", "X-Ca-Key,X-Ca-Nonce,X-Ca-Timestamp")
	toSign := "GET\n\n\n\n\nX-Ca-Key:" + appKey + "\nX-Ca-Nonce:" + nonce + "\nX-Ca-Timestamp:" + stamp + "\n/v1/public/course-catalog"
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(toSign))
	r.Header.Set("X-Ca-Signature", base64.StdEncoding.EncodeToString(mac.Sum(nil)))
	return r
}

func serve(c *Control, r *http.Request) *httptest.ResponseRecorder {
	recorder := httptest.NewRecorder()
	c.handler.ServeHTTP(recorder, r)
	return recorder
}

func item(plugin, config string) policy.Item {
	i := policy.Item{Plugin: plugin}
	if config != "" {
		i.Config = json.RawMessage(config)
	}
	return i
}

func save(t *testing.T, app core.App, record *core.Record, data map[string]any) error {
	t.Helper()
	for key, value := range data {
		record.Set(key, value)
	}
	return app.Save(record)
}

// Secrets are sealed before they are stored, never exported, and decrypted only
// into the compiled snapshot; a private API admits granted applications only,
// and application settings apply to their requests. Grants take effect on release.
func TestSealedSecretsApplicationsAndGrants(t *testing.T) {
	c, app := newControl(t)
	service := registered(t, c, app, newFakeService(t, manifestV1))
	group, drafted := draftGroup(t, app, "mapi", []string{"*"}, service.Id)
	appSecret := strings.Repeat("partner-secret-", 2)

	partner := create(t, app, schema.Consumers, map[string]any{"name": "partner", "appKey": "partner-app-key", "appSecret": appSecret, "enabled": true})
	other := create(t, app, schema.Consumers, map[string]any{"name": "other", "appKey": "other-app-key", "appSecret": appSecret, "enabled": true})
	secret := create(t, app, schema.Secrets, map[string]any{"name": "jwt", "value": strings.Repeat("j", 40)})
	for _, record := range []*core.Record{partner, secret} {
		field := sealedFields[record.Collection().Name]
		stored, err := app.FindRecordById(record.Collection().Name, record.Id)
		if err != nil {
			t.Fatal(err)
		}
		if !strings.HasPrefix(stored.GetString(field), sealedPrefix) || len(stored.GetString("fingerprint")) != 12 {
			t.Fatalf("%s stored unsealed: %q", record.Collection().Name, stored.GetString(field))
		}
		if _, exported := stored.PublicExport()[field]; exported {
			t.Fatalf("%s exports its secret", record.Collection().Name)
		}
		before := stored.GetString(field)
		stored.Set("note", "edited")
		if err := app.Save(stored); err != nil || stored.GetString(field) != before {
			t.Fatalf("an unrelated edit resealed the secret: %v", err)
		}
	}

	catalog := drafted["GET /v1/public/course-catalog"]
	if err := save(t, app, catalog, map[string]any{"auth": "signature", "visibility": "private"}); err != nil {
		t.Fatal(err)
	}
	create(t, app, schema.Grants, map[string]any{"consumer": partner.Id, "api": catalog.Id})
	partner, _ = app.FindRecordById(schema.Consumers, partner.Id)
	if err := save(t, app, partner, map[string]any{"policies": []policy.Item{item("rate-limit", `{"limit":1,"window":"minute","by":"consumer"}`)}}); err != nil {
		t.Fatal(err)
	}
	release(t, c, "RELEASE", targetsOf(group, all(drafted)...))
	if res := serve(c, signedRequest("partner-app-key", appSecret, "n1")); res.Code != 200 {
		t.Fatalf("signed request = %d %s %v", res.Code, res.Body.String(), res.Header())
	}
	if res := serve(c, signedRequest("partner-app-key", appSecret, "n2")); res.Code != 429 {
		t.Fatalf("application quota not applied: %d", res.Code)
	}
	if res := serve(c, signedRequest("partner-app-key", "guess", "n3")); res.Code != 400 {
		t.Fatalf("bad signature = %d", res.Code)
	}
	if res := serve(c, signedRequest("other-app-key", appSecret, "n4")); res.Code != 403 {
		t.Fatalf("an application without a grant = %d", res.Code)
	}
	create(t, app, schema.Grants, map[string]any{"consumer": other.Id, "group": group.Id, "stages": []string{"RELEASE"}})
	if res := serve(c, signedRequest("other-app-key", appSecret, "n5")); res.Code != 403 {
		t.Fatalf("a grant took effect before its release: %d", res.Code)
	}
	release(t, c, "RELEASE", targetsOf(nil, catalog))
	if res := serve(c, signedRequest("other-app-key", appSecret, "n6")); res.Code != 200 {
		t.Fatalf("a released grant = %d", res.Code)
	}
	raw, err := os.ReadFile(lastKnownGoodFile(app.DataDir(), "RELEASE"))
	if err != nil || strings.Contains(string(raw), appSecret) || !strings.Contains(string(raw), sealedPrefix) {
		t.Fatalf("last-known-good file holds a plaintext secret or none at all: %v", err)
	}

	// Edits no release could serve are refused when saved.
	set := create(t, app, schema.PolicySets, map[string]any{"name": "strict"})
	if err := save(t, app, set, map[string]any{"items": []policy.Item{item("rate-limit", `{"limit":0}`)}}); err == nil || !strings.Contains(err.Error(), "window") {
		t.Fatalf("invalid plugin config saved: %v", err)
	}
	baseline, err := app.FindFirstRecordByData(schema.PolicySets, "name", schema.Baseline)
	if err != nil {
		t.Fatal(err)
	}
	locked := item("cors", `{"allowOrigins":["https://www.ikanyue.com"]}`)
	locked.Locked = true
	if err := save(t, app, baseline, map[string]any{"items": []policy.Item{locked}}); err != nil {
		t.Fatal(err)
	}
	post := drafted["POST /v1/student/appointments"]
	if err := save(t, app, post, map[string]any{"overrides": []policy.Item{{Plugin: "cors", Disabled: true}}}); err == nil ||
		!strings.Contains(err.Error(), "locked") {
		t.Fatalf("an API switched a locked policy off: %v", err)
	}
	if err := app.Delete(baseline); err == nil {
		t.Fatal("deleted the baseline")
	}

	// Without the master key nothing sealed can be compiled.
	record, err := latestStageVersion(app, "RELEASE")
	if err != nil {
		t.Fatal(err)
	}
	var cfg snapshot.Config
	if err := record.UnmarshalJSONField("config", &cfg); err != nil {
		t.Fatal(err)
	}
	t.Setenv(testKeyEnv, "")
	if _, err := c.compile(cfg); err == nil || !strings.Contains(err.Error(), "32 character key") {
		t.Fatalf("compiled without a key: %v", err)
	}
}

// Policies resolve layer by layer: locked items of a group's set hold, rate
// limits stack, and an edit's impact is previewed per environment before saving.
func TestEffectivePoliciesAndImpact(t *testing.T) {
	c, app := newControl(t)
	service := registered(t, c, app, newFakeService(t, manifestV1))
	group, drafted := draftGroup(t, app, "mapi", []string{"*"}, service.Id)
	limit := item("rate-limit", `{"limit":100,"window":"minute","by":"ip"}`)
	limit.Locked = true
	defaults := create(t, app, schema.PolicySets, map[string]any{"name": "mapi-default", "items": []policy.Item{limit}})
	if err := save(t, app, group, map[string]any{"defaultPolicySet": defaults.Id}); err != nil {
		t.Fatal(err)
	}
	post := drafted["POST /v1/student/appointments"]
	if err := save(t, app, post, map[string]any{"overrides": []policy.Item{item("rate-limit", `{"limit":5,"window":"minute","by":"ip"}`)}}); err != nil {
		t.Fatal(err)
	}

	view, err := c.Effective(post.Id, "")
	if err != nil || view.Stage != "RELEASE" || len(view.Layers) != 4 || view.Error != "" || view.Served != nil {
		t.Fatalf("effective = %+v %v", view, err)
	}
	var layers []string
	for _, e := range view.Draft {
		layers = append(layers, e.Plugin+"@"+e.Layer)
	}
	if !slices.Equal(layers, []string{"rate-limit@group", "rate-limit@override"}) || !view.Draft[0].Locked {
		t.Fatalf("draft policies = %v", view.Draft)
	}
	release(t, c, "RELEASE", targetsOf(group, all(drafted)...))
	if view, _ := c.Effective(post.Id, "RELEASE"); view.Served == nil || view.Version != 1 || len(view.Served.Policies) != 2 {
		t.Fatalf("served = %+v", view)
	}
	for i := range 5 {
		if res := through(c, http.MethodPost, "http://any.host/v1/student/appointments", ""); res.Code != 200 {
			t.Fatalf("request %d = %d", i, res.Code)
		}
	}
	if res := through(c, http.MethodPost, "http://any.host/v1/student/appointments", ""); res.Code != 429 {
		t.Fatalf("the API's own limit = %d", res.Code)
	}

	// Raising the group's limit touches every API of the group in every environment.
	raised := item("rate-limit", `{"limit":200,"window":"minute","by":"ip"}`)
	raised.Locked = true
	impact, err := c.Impact(schema.PolicySets, defaults.Id, map[string]any{"items": []policy.Item{raised}})
	if err != nil || len(impact) != 3*len(drafted) {
		t.Fatalf("impact = %+v %v", impact, err)
	}
	// Switching the locked limit off from an API would be refused.
	impact, err = c.Impact(schema.APIs, post.Id, map[string]any{"overrides": []policy.Item{{Plugin: "rate-limit", Disabled: true}}})
	if err != nil || len(impact) != 3 || !strings.Contains(impact[0].Error, "locked") {
		t.Fatalf("impact of a refused edit = %+v %v", impact, err)
	}
	if impact, err := c.Impact(schema.APIs, post.Id, map[string]any{"note": "just a note"}); err != nil || len(impact) != 0 {
		t.Fatalf("impact of a note = %+v %v", impact, err)
	}
	if _, err := c.Impact(schema.Services, service.Id, nil); err == nil {
		t.Fatal("previewed an edit of a service")
	}
	// Nothing was saved.
	if stored, _ := app.FindRecordById(schema.PolicySets, defaults.Id); !strings.Contains(stored.GetString("items"), `"limit":100`) {
		t.Fatalf("impact saved the edit: %s", stored.GetString("items"))
	}
}

// Releases to an environment without a healthy instance of a changed API's
// service need force and a reason, both kept with the release.
func TestReleaseNeedsAHealthyInstanceUnlessForced(t *testing.T) {
	c, app := newControl(t)
	service := registered(t, c, app, newFakeService(t, manifestV1))
	group, drafted := draftGroup(t, app, "mapi", []string{"*"}, service.Id)
	instances, err := app.FindAllRecords(schema.Instances)
	if err != nil {
		t.Fatal(err)
	}
	for _, instance := range instances {
		instance.Set("stage", "LOCAL")
		if err := app.Save(instance); err != nil {
			t.Fatal(err)
		}
	}
	if err := c.rebuildEndpoints(); err != nil {
		t.Fatal(err)
	}
	req := Request{Stage: "RELEASE", Targets: targetsOf(group, all(drafted)...), Note: "cutover", Reason: "first release"}
	if _, err := c.Release("ops", req); err == nil || !strings.Contains(err.Error(), "no healthy RELEASE instance") {
		t.Fatalf("released with only LOCAL instances: %v", err)
	}
	req.Force, req.Reason = true, ""
	if _, err := c.Release("ops", req); err == nil || !strings.Contains(err.Error(), "needs a reason") {
		t.Fatalf("forced without a reason: %v", err)
	}
	req.Reason = "instances start after the release"
	if _, err := c.Release("ops", req); err != nil {
		t.Fatal(err)
	}
	records, err := app.FindAllRecords(schema.Releases, dbx.HashExp{"stage": "RELEASE", "kind": "api"})
	if err != nil || len(records) != 3 {
		t.Fatalf("releases = %d %v", len(records), err)
	}
	for _, record := range records {
		if !record.GetBool("forced") || record.GetString("reason") != req.Reason || record.GetString("note") != "cutover" {
			t.Fatalf("release record = %v", record)
		}
	}
	stage, err := latestStageVersion(app, "RELEASE")
	if err != nil || stage.GetString("action") != "release" || stage.GetString("actor") != "ops" {
		t.Fatalf("stage version = %v %v", stage, err)
	}
}
