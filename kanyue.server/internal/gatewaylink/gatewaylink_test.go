package gatewaylink

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/pocketbase/pocketbase/tests"
)

// Outbound calls are summarized per target and drained by each heartbeat;
// 5xx answers, refused credentials and transport errors count as failures.
func TestTrackedCallsReachTheHeartbeat(t *testing.T) {
	calls.drain()
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/fail":
			w.WriteHeader(http.StatusBadGateway)
		case "/denied":
			w.WriteHeader(http.StatusUnauthorized)
		case "/conflict":
			w.WriteHeader(http.StatusConflict)
		}
	}))
	defer upstream.Close()
	client := &http.Client{Transport: Track("kanyue.pay", nil)}
	for _, path := range []string{"/ok", "/ok", "/fail", "/denied", "/conflict"} {
		res, err := client.Get(upstream.URL + path)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
	}
	if _, err := (&http.Client{Transport: Track("wechat", nil)}).Get("http://127.0.0.1:1/"); err == nil {
		t.Fatal("reached a closed port")
	}

	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()
	reg := Registration{Gauges: map[string]func() (float64, error){
		"outboxDeadLetters": func() (float64, error) { return 3, nil },
		"broken":            func() (float64, error) { return 0, errors.New("unreadable") },
	}}
	body := reg.report(app, map[string]any{"service": "kanyue.server"})
	outbound := body["outbound"].([]Outbound)
	if len(outbound) != 2 || outbound[0] != (Outbound{Target: "kanyue.pay", Count: 5, Failures: 2, P95Ms: outbound[0].P95Ms}) ||
		outbound[1].Target != "wechat" || outbound[1].Failures != 1 || outbound[0].P95Ms <= 0 {
		t.Fatalf("outbound = %+v", outbound)
	}
	if gauges := body["gauges"].(map[string]float64); len(gauges) != 1 || gauges["outboxDeadLetters"] != 3 {
		t.Fatalf("gauges = %v", gauges)
	}
	if again := reg.report(app, nil)["outbound"].([]Outbound); len(again) != 0 {
		t.Fatalf("a heartbeat repeated drained calls: %+v", again)
	}
}

// Backups apply from the environment, refuse an unencrypted S3 secret, and
// report their result.
func TestConfigureBackupsReportsResults(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()
	env := map[string]string{"BACKUP_CRON": "0 3 * * *", "BACKUP_KEEP": "5", "BACKUP_S3_ENDPOINT": "https://s3.example.com"}
	if err := ConfigureBackups(app, func(name string) string { return env[name] }); err == nil {
		t.Fatal("stored an S3 secret without --encryptionEnv")
	}
	delete(env, "BACKUP_S3_ENDPOINT")
	lastBackup.Store(nil)
	if err := ConfigureBackups(app, func(name string) string { return env[name] }); err != nil {
		t.Fatal(err)
	}
	if backups := app.Settings().Backups; backups.Cron != "0 3 * * *" || backups.CronMaxKeep != 5 || backups.S3.Enabled {
		t.Fatalf("backup settings = %+v", backups)
	}
	if err := app.CreateBackup(context.Background(), "nightly.zip"); err != nil {
		t.Fatal(err)
	}
	backup := lastBackup.Load()
	if backup == nil || !backup.OK || backup.Name != "nightly.zip" || backup.Cron != "0 3 * * *" {
		t.Fatalf("last backup = %+v", backup)
	}
	if body := (Registration{}).report(app, nil); body["backup"] != backup {
		t.Fatalf("heartbeat backup = %v", body["backup"])
	}
}
