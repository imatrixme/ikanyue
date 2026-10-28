package pay

import (
	"archive/zip"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func writeSecret(t *testing.T, dir, name string, content []byte, mode os.FileMode) string {
	t.Helper()
	path := filepath.Join(dir, name)
	ok(t, os.WriteFile(path, content, mode))
	ok(t, os.Chmod(path, mode))
	return path
}

// liveFixture writes a merchant key, a matching certificate and one pinned platform key.
func liveFixture(t *testing.T, notifyURL string) (string, string) {
	t.Helper()
	dir := t.TempDir()
	keys := testKeys()
	merchant := keys.Credentials.PrivateKey
	template := &x509.Certificate{SerialNumber: big.NewInt(0x5157F09EFDC096DE), Subject: pkix.Name{CommonName: "merchant"},
		NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(365 * 24 * time.Hour)}
	certificate := must(x509.CreateCertificate(rand.Reader, template, template, &merchant.PublicKey, merchant))
	privateKey := must(x509.MarshalPKCS8PrivateKey(merchant))
	platform := must(x509.MarshalPKIXPublicKey(&keys.PlatformPrivateKey.PublicKey))
	files := map[string]any{
		"appId": "wx0123456789abcdef", "merchantId": "1900000001", "serial": "5157F09EFDC096DE",
		"privateKeyFile":  writeSecret(t, dir, "key.pem", pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: privateKey}), 0o600),
		"certificateFile": writeSecret(t, dir, "cert.pem", pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certificate}), 0o600),
		"publicKeyFiles": map[string]string{"PUB_KEY_ID_3000000001": writeSecret(t, dir, "platform.pem",
			pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: platform}), 0o600)},
		"apiV3KeyFile": writeSecret(t, dir, "v3.key", []byte(strings.Repeat("k", 32)+"\n"), 0o600),
		"notifyUrl":    notifyURL,
	}
	return writeSecret(t, dir, "wechat.json", jsonBytes(files), 0o600), dir
}

// Live credentials need protected files, a certificate matching the key, pinned keys and an exact callback.
func TestLiveCredentials(t *testing.T) {
	path, dir := liveFixture(t, "https://pay.example.com/callbacks/wechatpay")
	credentials := must(LiveCredentials(path))
	if credentials.MerchantID != "1900000001" || len(credentials.APIV3Key) != 32 || len(credentials.PublicKeys) != 1 {
		t.Fatalf("credentials = %+v", credentials)
	}
	ok(t, os.Chmod(filepath.Join(dir, "key.pem"), 0o644))
	_, err := LiveCredentials(path)
	wantCode(t, err, "CREDENTIAL_FILE_PERMISSIONS")
	_, err = LiveCredentials("relative/wechat.json")
	wantCode(t, err, "ABSOLUTE_CREDENTIAL_PATH_REQUIRED")
	badCallback, _ := liveFixture(t, "https://pay.example.com/callbacks/other")
	_, err = LiveCredentials(badCallback)
	wantCode(t, err, "WECHAT_CALLBACK_URL_INVALID")
	transport := must(LiveTransport(true))
	_, err = transport(must(newRequest("https://evil.example.com/v3/pay")))
	wantCode(t, err, "WECHAT_ORIGIN_FORBIDDEN")
}

// The restore drill verifies the newest real archive; empty or foreign entries never win.
func TestNewestBackup(t *testing.T) {
	newest, at, found := newestBackup([]backupFile{
		{Key: "nightly-1.zip", Size: 10, Modified: "2026-10-27 18:00:00.000Z"},
		{Key: "nightly-2.zip", Size: 10, Modified: "2026-10-28 18:00:00.000Z"},
		{Key: "partial.zip", Size: 0, Modified: "2026-10-29 18:00:00.000Z"},
		{Key: "notes.txt", Size: 10, Modified: "2026-10-30 18:00:00.000Z"},
		{Key: "odd.zip", Size: 10, Modified: "yesterday"},
	})
	if !found || newest.Key != "nightly-2.zip" || at.Format(time.RFC3339) != "2026-10-28T18:00:00Z" {
		t.Fatalf("newest = %+v %v %v", newest, at, found)
	}
	if _, _, found := newestBackup([]backupFile{{Key: "partial.zip", Modified: "2026-10-29 18:00:00.000Z"}}); found {
		t.Fatal("an empty archive counted as a backup")
	}
}

// A backup archive is verified offline: safe paths, SQLite integrity and money table counts.
func TestVerifyBackup(t *testing.T) {
	app := openApp(t, t.TempDir())
	ok(t, PocketBaseStore{App: app}.Commit([]Mutation{insert(fresh(recordID("b"), "payment", "kanyue", map[string]any{"amount": 1}))}))
	archive := filepath.Join(t.TempDir(), "kanyue-payment.zip")
	ok(t, app.CreateBackup(t.Context(), "kanyue-payment.zip"))
	ok(t, os.Rename(filepath.Join(app.DataDir(), "backups", "kanyue-payment.zip"), archive))
	report := must(VerifyBackup(archive, "payment", "http://127.0.0.1:1340"))
	if report["integrity"] != "ok" || report["counts"].(map[string]int)["pay_entities"] != 1 {
		t.Fatalf("report = %v", report)
	}
	if _, err := os.Stat(report["reportPath"].(string)); err != nil {
		t.Fatal(err)
	}
	unsafe := filepath.Join(t.TempDir(), "unsafe.zip")
	file := must(os.Create(unsafe))
	writer := zip.NewWriter(file)
	must(writer.Create("../escape"))
	ok(t, writer.Close())
	ok(t, file.Close())
	_, err := VerifyBackup(unsafe, "payment", "")
	wantCode(t, err, "BACKUP_UNSAFE_PATH")
}
