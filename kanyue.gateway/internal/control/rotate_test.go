package control

import (
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/security"

	"kanyue.gateway/internal/schema"
)

const newKeyEnv = "KANYUE_GATEWAY_TEST_NEW_KEY"

// sealedIn lists every sealed value stored in the database and the last-known-good files.
func sealedIn(t *testing.T, c *Control) []string {
	t.Helper()
	var values []string
	fields := map[string]int{}
	if _, err := c.resealRecords(func(text string) (string, error) {
		values = append(values, sealedValue.FindAllString(text, -1)...)
		return text, nil
	}, fields); err != nil {
		t.Fatal(err)
	}
	for _, name := range lastKnownGoodFiles(c.app.DataDir()) {
		if raw, err := os.ReadFile(name); err == nil {
			values = append(values, sealedValue.FindAllString(string(raw), -1)...)
		}
	}
	return values
}

func opensWith(sealed, key string) bool {
	_, err := security.Decrypt(strings.TrimPrefix(sealed, sealedPrefix), key)
	return err == nil
}

func backups(t *testing.T, app core.App) []string {
	t.Helper()
	entries, err := os.ReadDir(filepath.Join(app.DataDir(), "backups"))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, entry := range entries {
		if strings.HasSuffix(entry.Name(), ".zip") {
			names = append(names, entry.Name())
		}
	}
	return names
}

// Secrets, consumers and the released configuration move to the new key in one
// go; the old key opens nothing afterwards and released environments still serve.
func TestRotateKeyReseals(t *testing.T) {
	c, app := newControl(t)
	oldKey := os.Getenv(testKeyEnv)
	newKey := strings.Repeat("n", 32)
	t.Setenv(newKeyEnv, newKey)
	upstream := newFakeService(t, manifestV1)
	service := registered(t, c, app, upstream)
	create(t, app, schema.Consumers, map[string]any{"name": "partner", "appKey": "partner-app-key", "appSecret": strings.Repeat("s", 32), "enabled": true})
	create(t, app, schema.Secrets, map[string]any{"name": "jwt", "value": strings.Repeat("j", 40)})
	group, apis := draftGroup(t, app, "mapi", []string{"mapi.ikanyue.com"}, service.Id)
	release(t, c, "RELEASE", targetsOf(group, all(apis)...))

	before := sealedIn(t, c)
	if len(before) < 4 { // two records, and both again in the released configuration
		t.Fatalf("sealed values before = %d", len(before))
	}

	// The wrong current key stops before anything is written.
	t.Setenv(testKeyEnv, strings.Repeat("w", 32))
	if _, err := c.RotateKey(newKeyEnv); err == nil || !strings.Contains(err.Error(), "neither key") {
		t.Fatalf("rotation with the wrong key: %v", err)
	}
	if got := sealedIn(t, c); strings.Join(got, ",") != strings.Join(before, ",") || len(backups(t, app)) != 0 {
		t.Fatal("a failed rotation wrote something")
	}
	t.Setenv(testKeyEnv, oldKey)

	// A serving gateway holds the shared lock.
	lock, err := lockDataDir(app.DataDir(), false)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := c.RotateKey(newKeyEnv); !errors.Is(err, errDataDirBusy) {
		t.Fatalf("rotation while serving: %v", err)
	}
	lock.Close()

	report, err := c.RotateKey(newKeyEnv)
	if err != nil {
		t.Fatal(err)
	}
	if report.Values != len(before) || report.Already != 0 || report.Files == 0 || report.Backup == "" || len(backups(t, app)) != 1 {
		t.Fatalf("report = %+v, backups %v", report, backups(t, app))
	}
	if os.Getenv(testKeyEnv) != newKey {
		t.Fatal("PocketBase settings are not sealed with the new key")
	}
	for _, sealed := range sealedIn(t, c) {
		if !opensWith(sealed, newKey) || opensWith(sealed, oldKey) {
			t.Fatal("a value is not sealed with the new key alone")
		}
	}
	if err := app.ReloadSettings(); err != nil {
		t.Fatalf("settings with the new key: %v", err)
	}
	c.loadRoutes()
	if got := through(c, http.MethodGet, "http://mapi.ikanyue.com/v1/public/course-catalog", "").Code; got != http.StatusOK {
		t.Fatalf("served after rotation: %d", got)
	}

	// Running it again, e.g. after an interruption, keeps what the new key opens.
	t.Setenv(testKeyEnv, oldKey)
	again, err := c.RotateKey(newKeyEnv)
	if err != nil || again.Values != 0 || again.Already != len(before) {
		t.Fatalf("second run = %+v %v", again, err)
	}
}
