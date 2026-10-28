package control

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.gateway/internal/schema"
	"kanyue.gateway/internal/snapshot"
)

// publishedServer registers the fake service, syncs its manifest and routes every operation of it.
func publishedServer(t *testing.T, c *Control, app core.App) (service, route *core.Record) {
	t.Helper()
	upstream := newFakeService(t, manifestV1)
	if err := c.Heartbeat(Beat{Service: "kanyue.server", Address: upstream.address(), Stage: "RELEASE", ManifestHash: "h1"}); err != nil {
		t.Fatal(err)
	}
	waitFor(t, func() bool { return len(statuses(t, app)) == 3 })
	if err := c.rebuildEndpoints(); err != nil {
		t.Fatal(err)
	}
	service, err := app.FindFirstRecordByData(schema.Services, "name", "kanyue.server")
	if err != nil {
		t.Fatal(err)
	}
	site := create(t, app, schema.Sites, map[string]any{"name": "mapi", "hosts": []string{"*"}})
	route = create(t, app, schema.Routes, map[string]any{"name": "server", "site": site.Id, "service": service.Id,
		"operations": selectable(t, app, service.Id), "enabled": true})
	return service, route
}

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

// Secrets are sealed before they are stored, never exported, and decrypted only
// into the compiled snapshot; consumers sign requests and consumer bindings apply to them.
func TestSealedSecretsConsumersAndBindings(t *testing.T) {
	c, app := newControl(t)
	_, route := publishedServer(t, c, app)
	appSecret := strings.Repeat("partner-secret-", 2)

	consumer := create(t, app, schema.Consumers, map[string]any{"name": "partner", "appKey": "partner-app-key", "appSecret": appSecret, "enabled": true})
	secret := create(t, app, schema.Secrets, map[string]any{"name": "jwt", "value": strings.Repeat("j", 40)})
	for _, record := range []*core.Record{consumer, secret} {
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

	create(t, app, schema.PluginBindings, map[string]any{"plugin": "aliyun-signature", "scope": "route", "route": route.Id, "enabled": true})
	create(t, app, schema.PluginBindings, map[string]any{"plugin": "rate-limit", "scope": "consumer", "consumer": consumer.Id,
		"config": map[string]any{"limit": 1, "window": "minute", "by": "consumer"}, "enabled": true})
	if _, err := c.Publish("ops", Release{Note: "signed"}); err != nil {
		t.Fatal(err)
	}
	if res := serve(c, signedRequest("partner-app-key", appSecret, "n1")); res.Code != 200 {
		t.Fatalf("signed request = %d %s %v", res.Code, res.Body.String(), res.Header())
	}
	if res := serve(c, signedRequest("partner-app-key", appSecret, "n2")); res.Code != 429 {
		t.Fatalf("consumer quota not applied: %d", res.Code)
	}
	if res := serve(c, signedRequest("partner-app-key", "guess", "n3")); res.Code != 400 {
		t.Fatalf("bad signature = %d", res.Code)
	}
	raw, err := os.ReadFile(filepath.Join(app.DataDir(), lastKnownGood))
	if err != nil || strings.Contains(string(raw), appSecret) || !strings.Contains(string(raw), sealedPrefix) {
		t.Fatalf("last-known-good file holds a plaintext secret or none at all: %v", err)
	}

	// A plugin configuration its schema rejects fails the publish and leaves the running version alone.
	create(t, app, schema.PluginBindings, map[string]any{"plugin": "rate-limit", "scope": "global", "config": map[string]any{"limit": 0}, "enabled": true})
	if _, err := c.Publish("ops", Release{}); err == nil || !strings.Contains(err.Error(), "window is required") {
		t.Fatalf("invalid plugin config published: %v", err)
	}
	if c.handler.Version() != 1 {
		t.Fatalf("running version changed to %d", c.handler.Version())
	}

	// Without the master key nothing sealed can be compiled.
	t.Setenv(testKeyEnv, "")
	if _, err := c.compile(snapshotOf(t, app, 1)); err == nil || !strings.Contains(err.Error(), "32 character key") {
		t.Fatalf("compiled without a key: %v", err)
	}
}

// Routes to a service without a healthy RELEASE instance publish only when forced with a reason.
func TestPublishNeedsAHealthyInstanceUnlessForced(t *testing.T) {
	c, app := newControl(t)
	publishedServer(t, c, app)
	instances, err := app.FindAllRecords(schema.Instances)
	if err != nil {
		t.Fatal(err)
	}
	// Instances of another stage do not serve requests without X-Ca-Stage.
	for _, instance := range instances {
		instance.Set("stage", "LOCAL")
		if err := app.Save(instance); err != nil {
			t.Fatal(err)
		}
	}
	if err := c.rebuildEndpoints(); err != nil {
		t.Fatal(err)
	}
	if _, err := c.Publish("ops", Release{Note: "cutover"}); err == nil || !strings.Contains(err.Error(), "no healthy RELEASE instance") {
		t.Fatalf("published with only LOCAL instances: %v", err)
	}
	for _, instance := range instances {
		instance.Set("status", "offline")
		if err := app.Save(instance); err != nil {
			t.Fatal(err)
		}
	}
	if err := c.rebuildEndpoints(); err != nil {
		t.Fatal(err)
	}
	if _, err := c.Publish("ops", Release{Note: "cutover"}); err == nil || !strings.Contains(err.Error(), "no healthy RELEASE instance") {
		t.Fatalf("published without instances: %v", err)
	}
	if _, err := c.Publish("ops", Release{Force: true}); err == nil || !strings.Contains(err.Error(), "needs a reason") {
		t.Fatalf("forced without a reason: %v", err)
	}
	version, err := c.Publish("ops", Release{Note: "cutover", Force: true, Reason: "instances start after the publish"})
	if err != nil {
		t.Fatal(err)
	}
	record := snapshotRecord(t, app, version)
	if record.GetString("note") != "cutover [forced: instances start after the publish]" {
		t.Fatalf("note = %q", record.GetString("note"))
	}
}

func snapshotRecord(t *testing.T, app core.App, version int) *core.Record {
	t.Helper()
	record, err := app.FindFirstRecordByData(schema.ConfigVersions, "version", version)
	if err != nil {
		t.Fatal(err)
	}
	return record
}

func snapshotOf(t *testing.T, app core.App, version int) snapshot.Config {
	t.Helper()
	var cfg snapshot.Config
	if err := snapshotRecord(t, app, version).UnmarshalJSONField("config", &cfg); err != nil {
		t.Fatal(err)
	}
	return cfg
}
