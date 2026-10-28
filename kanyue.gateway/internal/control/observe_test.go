package control

import (
	"archive/zip"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"kanyue.gateway/internal/config"
	"kanyue.gateway/internal/proxy"
	"kanyue.gateway/internal/schema"
	"kanyue.gateway/internal/telemetry"
)

func withTelemetry(t *testing.T, c *Control) *telemetry.Telemetry {
	t.Helper()
	tel, err := telemetry.Open(telemetry.Options{Path: filepath.Join(t.TempDir(), telemetryFile), Sample: 1,
		Slow: time.Second, LogRetention: time.Hour, MetricRetention: time.Hour})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		tel.SetExports(nil)
		tel.Close()
	})
	c.useTelemetry(tel)
	return tel
}

// hook collects what an alert webhook receives and checks its signature.
type hook struct {
	mu      sync.Mutex
	secret  string
	notices []Notice
	server  *httptest.Server
}

func newHook(t *testing.T, secret string) *hook {
	h := &hook{secret: secret}
	h.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		mac := hmac.New(sha256.New, []byte(h.secret))
		mac.Write([]byte(r.Header.Get("X-Kanyue-Timestamp") + "."))
		mac.Write(body)
		if r.Header.Get("X-Kanyue-Signature") != "sha256="+hex.EncodeToString(mac.Sum(nil)) {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		var notice Notice
		json.Unmarshal(body, &notice)
		h.mu.Lock()
		h.notices = append(h.notices, notice)
		h.mu.Unlock()
	}))
	t.Cleanup(h.server.Close)
	return h
}

func (h *hook) received() []Notice {
	h.mu.Lock()
	defer h.mu.Unlock()
	return append([]Notice(nil), h.notices...)
}

// Heartbeats carry outbound calls, gauges and backups; rules fire after their
// duration, notify signed webhooks and send a recovery notice.
func TestReportsAndAlerts(t *testing.T) {
	c, app := newControl(t)
	tel := withTelemetry(t, c)
	upstream := newFakeService(t, manifestV1)
	beat := Beat{Service: "kanyue.server", Address: upstream.address(), ManifestHash: "h1",
		Outbound: []telemetry.Outbound{{Target: "payment-callback", Count: 3, Failures: 2, P95Ms: 40}},
		Gauges:   map[string]float64{"outboxDeadLetters": 4},
		Backup:   &Backup{At: time.Now().Add(-48 * time.Hour), OK: true, Name: "old.zip"}}
	if err := c.Heartbeat(beat); err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	minute := now.Truncate(time.Minute)
	calls, _ := tel.Calls(context.Background(), minute, minute.Add(time.Minute))
	if len(calls) != 1 || calls[0].Source != "kanyue.server" || calls[0].Failures != 2 {
		t.Fatalf("calls = %+v", calls)
	}

	secret := strings.Repeat("s", 24)
	webhook := newHook(t, secret)
	channel := create(t, app, schema.AlertChannels, map[string]any{"name": "ops", "kind": "webhook", "url": webhook.server.URL,
		"secret": secret, "enabled": true})
	rule := func(name, template string, forMinutes int) *core.Record {
		return create(t, app, schema.AlertRules, map[string]any{"name": name, "template": template, "forMinutes": forMinutes,
			"channels": []string{channel.Id}, "enabled": true})
	}
	rule("死信", "outbox-dead-letters", 0)
	rule("备份", "backup-overdue", 0)
	rule("支付回调", "outbound-failures", 0)
	rule("慢热", "outbox-dead-letters", 5)

	// The outbound minute is evaluated once it has ended.
	if err := c.EvaluateAlerts(context.Background(), minute.Add(time.Minute+5*time.Second)); err != nil {
		t.Fatal(err)
	}
	waitFor(t, func() bool { return len(webhook.received()) == 4 })
	subjects := map[string]string{}
	for _, notice := range webhook.received() {
		if notice.State != "firing" {
			t.Fatalf("notice = %+v", notice)
		}
		subjects[notice.Rule+"/"+notice.Subject] = notice.Message
	}
	if !strings.Contains(subjects["死信/kanyue.server"], "4 条") || !strings.Contains(subjects["备份/kanyue.server"], "小时") ||
		!strings.Contains(subjects["备份/kanyue.gateway"], "还没有上报") || !strings.Contains(subjects["支付回调/payment-callback"], "失败 2 次") {
		t.Fatalf("notices = %v", subjects)
	}

	// The backlog clears: a recovery notice follows; the slow rule never fired, so it stays quiet.
	beat.Outbound, beat.Gauges = nil, map[string]float64{"outboxDeadLetters": 0}
	if err := c.Heartbeat(beat); err != nil {
		t.Fatal(err)
	}
	if err := c.EvaluateAlerts(context.Background(), minute.Add(2*time.Minute+5*time.Second)); err != nil {
		t.Fatal(err)
	}
	waitFor(t, func() bool { return len(webhook.received()) == 6 })
	resolved := map[string]bool{}
	for _, notice := range webhook.received()[4:] {
		resolved[notice.Rule+"/"+notice.State] = true
	}
	if !resolved["死信/resolved"] || !resolved["支付回调/resolved"] {
		t.Fatalf("recovery notices = %v", resolved)
	}
	events, _ := tel.Events(context.Background(), "alert", 20)
	if len(events) != 6 {
		t.Fatalf("alert events = %d", len(events))
	}

	// A route 5xx storm, recorded by the data plane, fires its rule.
	rule("5xx", "5xx-ratio", 0)
	for i := range 30 {
		status := 200
		if i%2 == 0 {
			status = 502
		}
		tel.Record(proxy.Entry{Time: minute.Add(3 * time.Minute), Route: "server", Service: "svc", Status: status, Duration: time.Millisecond})
	}
	tel.Flush(minute.Add(4 * time.Minute))
	if err := c.EvaluateAlerts(context.Background(), minute.Add(4*time.Minute+5*time.Second)); err != nil {
		t.Fatal(err)
	}
	waitFor(t, func() bool { return len(webhook.received()) == 7 })
	if last := webhook.received()[6]; last.Subject != "server" || !strings.Contains(last.Message, "50.0%") {
		t.Fatalf("5xx notice = %+v", last)
	}
}

// An exporter cannot be enabled while its connection test fails; once it
// passes, request logs flow to it.
func TestExporterIsProbedBeforeEnabling(t *testing.T) {
	c, app := newControl(t)
	tel := withTelemetry(t, c)
	var mu sync.Mutex
	up := false
	var received []string
	endpoint := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		if !up || r.Header.Get("Authorization") != "Bearer "+strings.Repeat("v", 20) {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		body, _ := io.ReadAll(r.Body)
		received = append(received, string(body))
	}))
	defer endpoint.Close()

	collection, _ := app.FindCollectionByNameOrId(schema.Exporters)
	exporter := core.NewRecord(collection)
	exporter.Load(map[string]any{"name": "vlogs", "url": endpoint.URL + "/insert/jsonline", "auth": "bearer",
		"secret": strings.Repeat("v", 20), "enabled": true})
	if err := app.Save(exporter); err == nil || !strings.Contains(err.Error(), "connection test failed") {
		t.Fatalf("enabled a failing exporter: %v", err)
	}
	exporter.Set("enabled", false)
	if err := app.Save(exporter); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(exporter.GetString("secret"), sealedPrefix) {
		t.Fatal("export token stored unsealed")
	}
	mu.Lock()
	up = true
	mu.Unlock()
	exporter.Set("enabled", true)
	if err := app.Save(exporter); err != nil {
		t.Fatal(err)
	}
	if exports := tel.Exports(); len(exports) != 1 || exports[0].Name != "vlogs" {
		t.Fatalf("exports = %+v", exports)
	}
	tel.Record(proxy.Entry{Time: time.Now(), Route: "server", Method: "GET", Path: "/v1/x", Status: 500})
	waitFor(t, func() bool {
		mu.Lock()
		defer mu.Unlock()
		return len(received) == 2 // the probe, then the record
	})
	mu.Lock()
	defer mu.Unlock()
	if !strings.Contains(received[1], `"_msg":"GET /v1/x 500"`) {
		t.Fatalf("exported = %s", received[1])
	}
}

// Restore drill: a backup of the gateway's data dir restores into a fresh dir
// whose released versions compile and serve again.
func TestBackupRestoresReleasedConfiguration(t *testing.T) {
	c, app := newControl(t)
	service := registered(t, c, app, newFakeService(t, manifestV1))
	group, drafted := draftGroup(t, app, "mapi", []string{"*"}, service.Id)
	release(t, c, "RELEASE", targetsOf(group, all(drafted)...))
	if err := app.CreateBackup(context.Background(), "drill.zip"); err != nil {
		t.Fatal(err)
	}
	if backup := c.obs.ownBackup.Load(); backup == nil || !backup.OK || backup.Name != "drill.zip" {
		t.Fatalf("own backup = %+v", backup)
	}

	restored := t.TempDir()
	archive, err := zip.OpenReader(filepath.Join(app.DataDir(), core.LocalBackupsDirName, "drill.zip"))
	if err != nil {
		t.Fatal(err)
	}
	defer archive.Close()
	for _, file := range archive.File {
		target := filepath.Join(restored, filepath.FromSlash(file.Name))
		if !strings.HasPrefix(target, restored+string(os.PathSeparator)) {
			t.Fatalf("unsafe path in backup: %s", file.Name)
		}
		if file.FileInfo().IsDir() {
			continue
		}
		os.MkdirAll(filepath.Dir(target), 0o755)
		src, err := file.Open()
		if err != nil {
			t.Fatal(err)
		}
		dst, err := os.Create(target)
		if err != nil {
			t.Fatal(err)
		}
		io.Copy(dst, src)
		src.Close()
		dst.Close()
	}

	copyApp, err := tests.NewTestAppWithConfig(core.BaseAppConfig{DataDir: restored, EncryptionEnv: testKeyEnv})
	if err != nil {
		t.Fatal(err)
	}
	defer copyApp.Cleanup()
	copy := New(copyApp, config.Config{RegistrationToken: token}, newHandler())
	copy.bindHooks()
	copy.loadRoutes()
	if v := copy.handler.Versions()["RELEASE"]; v != 1 {
		t.Fatalf("restored version = %d", v)
	}
	if err := copy.rebuildEndpoints(); err != nil {
		t.Fatal(err)
	}
	if result, err := copy.Offline("ops", Request{Stage: "RELEASE", Targets: targetsOf(nil, drafted["POST /v1/student/appointments"])}); err != nil || result.Version != 2 {
		t.Fatalf("release after restore = %+v %v", result, err)
	}
}

// The restore drill command picks the newest backup from the backup storage,
// restores it into a scratch dir and reports what it proved, without serving.
func TestVerifyBackupRestoresTheNewest(t *testing.T) {
	c, app := newControl(t)
	if _, err := c.VerifyBackup("", 0); err == nil || !strings.Contains(err.Error(), "no backups in local storage") {
		t.Fatalf("no backups = %v", err)
	}
	service := registered(t, c, app, newFakeService(t, manifestV1))
	// Sealed secrets are released with the configuration, so only the right key restores it.
	create(t, app, schema.Consumers, map[string]any{"name": "partner", "appKey": "partner-app-key", "appSecret": strings.Repeat("s", 32), "enabled": true})
	group, drafted := draftGroup(t, app, "mapi", []string{"*"}, service.Id)
	release(t, c, "RELEASE", targetsOf(group, all(drafted)...))
	if err := app.CreateBackup(context.Background(), "old.zip"); err != nil {
		t.Fatal(err)
	}
	if _, err := c.Offline("ops", Request{Stage: "RELEASE", Targets: targetsOf(nil, drafted["POST /v1/student/appointments"])}); err != nil {
		t.Fatal(err)
	}
	time.Sleep(10 * time.Millisecond) // modification times order the backups
	if err := app.CreateBackup(context.Background(), "new.zip"); err != nil {
		t.Fatal(err)
	}

	check, err := c.VerifyBackup("", time.Hour)
	if err != nil || check.Backup != "new.zip" || check.Storage != "local" || check.Integrity != "ok" || check.Size == 0 ||
		check.Versions["RELEASE"] != 2 || len(check.Versions) != 1 {
		t.Fatalf("newest = %+v %v", check, err)
	}
	if check, err := c.VerifyBackup("old.zip", 0); err != nil || check.Versions["RELEASE"] != 1 {
		t.Fatalf("named = %+v %v", check, err)
	}
	if _, err := c.VerifyBackup("missing.zip", 0); err == nil || !strings.Contains(err.Error(), "no local backup named missing.zip") {
		t.Fatalf("missing = %v", err)
	}
	if _, err := c.VerifyBackup("", time.Nanosecond); err == nil || !strings.Contains(err.Error(), "not being taken on schedule") {
		t.Fatalf("stale = %v", err)
	}
	// A key that cannot open the backup's settings fails the drill.
	t.Setenv(testKeyEnv, strings.Repeat("x", 32))
	if _, err := c.VerifyBackup("", 0); err == nil {
		t.Fatal("restored with the wrong key")
	}
}

// Prometheus scrapes with a viewer token; an OTLP exporter sends spans, not lines.
func TestPrometheusScrapeAndTraceExporter(t *testing.T) {
	c, app := newControl(t)
	tel := withTelemetry(t, c)
	call, session := adminAPI(t, c, app)
	viewer := mint(t, call, session, `{"name":"prometheus","role":"viewer"}`)
	tel.Record(proxy.Entry{Time: time.Now(), Stage: "RELEASE", Group: "mapi", Route: "server", Service: "kanyue.server",
		Method: "GET", Path: "/v1/x", Status: 200, Duration: time.Millisecond})

	if res := call("GET", "/gateway/v1/prometheus", "", ""); res.Code != 401 {
		t.Fatalf("anonymous scrape = %d", res.Code)
	}
	res := call("GET", "/gateway/v1/prometheus", viewer, "")
	text := res.Body.String()
	if res.Code != 200 || !strings.HasPrefix(res.Header().Get("Content-Type"), "text/plain; version=0.0.4") ||
		!strings.Contains(text, `kanyue_gateway_requests_total{stage="RELEASE",group="mapi",api="server",service="kanyue.server",code="2xx"} 1`+"\n") ||
		!strings.Contains(text, `kanyue_gateway_stage_version{stage="PRE"} 0`+"\n") ||
		!strings.Contains(text, "# TYPE go_memstats_heap_inuse_bytes gauge\n") || !strings.Contains(text, "# TYPE go_goroutines gauge\n") {
		t.Fatalf("scrape = %d\n%s", res.Code, text)
	}
	if _, linux := residentBytes(); linux != strings.Contains(text, "\nprocess_resident_memory_bytes ") {
		t.Fatalf("resident memory reported = %v on a platform where it is readable = %v", !linux, linux)
	}
	if audited(t, app, "token:prometheus", "refused") != 0 {
		t.Fatal("a scrape was refused")
	}

	collection, _ := app.FindCollectionByNameOrId(schema.Exporters)
	record := core.NewRecord(collection)
	record.Load(map[string]any{"name": "tempo", "url": "http://127.0.0.1:4318/v1/traces", "format": "otlp-traces", "auth": "bearer",
		"secret": strings.Repeat("o", 20)})
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
	exporter, err := c.exporterOf(record)
	traces, ok := exporter.(*telemetry.OTLPTraces)
	if err != nil || !ok || traces.Token != strings.Repeat("o", 20) || traces.URL != "http://127.0.0.1:4318/v1/traces" {
		t.Fatalf("exporter = %#v %v", exporter, err)
	}
}
