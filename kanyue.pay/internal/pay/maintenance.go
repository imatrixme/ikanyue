package pay

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/spf13/cobra"
)

// MaintenanceCommand is the release gate: verified backups and live preflight.
// It never restores, switches traffic or charges money.
func MaintenanceCommand() *cobra.Command {
	command := &cobra.Command{Use: "maintenance", Short: "Verified backups and live release preflight"}
	report := func(cmd *cobra.Command, value any, err error) error {
		if err != nil {
			cmd.PrintErrln(codeOr(err, "MAINTENANCE_FAILED"))
			return err
		}
		cmd.Println(string(jsonIndent(value)))
		return nil
	}
	command.AddCommand(&cobra.Command{
		Use:          "backup payment|business",
		Short:        "Create a PocketBase backup through its API and verify the archive offline",
		Args:         cobra.MatchAll(cobra.ExactArgs(1), cobra.OnlyValidArgs),
		ValidArgs:    []string{"payment", "business"},
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			result, err := Backup(args[0], Environ())
			return report(cmd, result, err)
		},
	}, &cobra.Command{
		Use:          "preflight",
		Short:        "Check live configuration, backups and external acceptance attestations",
		Args:         cobra.NoArgs,
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			result, err := Preflight(Environ())
			return report(cmd, result, err)
		},
	})
	return command
}

func jsonIndent(value any) []byte {
	raw, _ := json.MarshalIndent(value, "", "  ")
	return raw
}

func backupPrefix(scope string) string {
	if scope == "payment" {
		return "PAY_PB"
	}
	return "PB"
}

func localOrTLS(raw string) bool {
	target, err := url.Parse(raw)
	return err == nil && (target.Scheme == "https" ||
		(target.Scheme == "http" && (target.Hostname() == "127.0.0.1" || target.Hostname() == "localhost")))
}

func pbRequest(method, target, token string, body any, value any) error {
	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(jsonBytes(body))
	}
	request, err := http.NewRequest(method, target, reader)
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", "application/json")
	if token != "" {
		request.Header.Set("Authorization", token)
	}
	response, err := DefaultTransport(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode > 299 {
		return fmt.Errorf("%s %s: HTTP %d", method, request.URL.Path, response.StatusCode)
	}
	if value == nil {
		return nil
	}
	return json.NewDecoder(response.Body).Decode(value)
}

// Backup asks a PocketBase (the embedded pay store or kanyue.server) for a backup,
// downloads it into a private temporary directory and verifies it.
func Backup(scope string, env map[string]string) (map[string]any, error) {
	prefix := backupPrefix(scope)
	source := strings.TrimRight(env[prefix+"_URL"], "/")
	if !localOrTLS(source) {
		return nil, fail("BACKUP_TLS_REQUIRED", 400)
	}
	var auth struct{ Token string }
	if err := pbRequest(http.MethodPost, source+"/api/collections/_superusers/auth-with-password", "",
		map[string]any{"identity": env[prefix+"_EMAIL"], "password": env[prefix+"_PASSWORD"]}, &auth); err != nil {
		return nil, err
	}
	filename := fmt.Sprintf("kanyue-%s-%d.zip", scope, time.Now().UnixMilli())
	if err := pbRequest(http.MethodPost, source+"/api/backups", auth.Token, map[string]any{"name": filename}, nil); err != nil {
		return nil, err
	}
	ready := false
	for attempt := 0; attempt < 40 && !ready; attempt++ {
		var files []struct {
			Key  string
			Size int64
		}
		if err := pbRequest(http.MethodGet, source+"/api/backups", auth.Token, nil, &files); err != nil {
			return nil, err
		}
		for _, file := range files {
			ready = ready || (file.Key == filename && file.Size > 0)
		}
		if !ready {
			time.Sleep(500 * time.Millisecond)
		}
	}
	if !ready {
		return nil, fail("BACKUP_NOT_READY", 503)
	}
	var fileToken struct{ Token string }
	if err := pbRequest(http.MethodPost, source+"/api/files/token", auth.Token, nil, &fileToken); err != nil {
		return nil, err
	}
	request, err := http.NewRequest(http.MethodGet, source+"/api/backups/"+url.PathEscape(filename)+"?token="+url.QueryEscape(fileToken.Token), nil)
	if err != nil {
		return nil, err
	}
	response, err := (&http.Client{Timeout: 60 * time.Second, CheckRedirect: noRedirects.CheckRedirect}).Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fail("BACKUP_DOWNLOAD_FAILED", 502)
	}
	directory, err := os.MkdirTemp("", "kanyue-"+scope+"-backup-")
	if err != nil {
		return nil, err
	}
	archive := filepath.Join(directory, filename)
	file, err := os.OpenFile(archive, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return nil, err
	}
	if _, err := io.Copy(file, response.Body); err != nil {
		file.Close()
		return nil, err
	}
	if err := file.Close(); err != nil {
		return nil, err
	}
	return VerifyBackup(archive, scope, source)
}

func backupTables(scope string) []string {
	if scope == "payment" {
		return []string{"pay_entities"}
	}
	return []string{"commerce_orders", "commerce_refunds", "commerce_audit", "credit_batches", "credit_events"}
}

// VerifyBackup extracts into a fresh directory, checks SQLite integrity and money
// table counts read-only, and writes a restrictive SHA-256 report next to the archive.
func VerifyBackup(archive, scope, source string) (map[string]any, error) {
	if info, err := os.Stat(archive); !strings.HasPrefix(archive, "/") || err != nil || !info.Mode().IsRegular() {
		return nil, fail("BACKUP_PATH_REQUIRED", 400)
	}
	reader, err := zip.OpenReader(archive)
	if err != nil {
		return nil, err
	}
	defer reader.Close()
	restored, err := os.MkdirTemp("", "kanyue-"+scope+"-restore-check-")
	if err != nil {
		return nil, err
	}
	if len(reader.File) == 0 {
		return nil, fail("BACKUP_UNSAFE_PATH", 400)
	}
	for _, entry := range reader.File {
		name := entry.Name
		if strings.HasPrefix(name, "/") || strings.Contains(name, `\`) || filepath.IsAbs(name) ||
			strings.Contains("/"+name+"/", "/../") {
			return nil, fail("BACKUP_UNSAFE_PATH", 400)
		}
		target := filepath.Join(restored, name)
		if entry.FileInfo().IsDir() {
			if err := os.MkdirAll(target, 0o700); err != nil {
				return nil, err
			}
			continue
		}
		if err := extract(entry, target); err != nil {
			return nil, err
		}
	}
	db, err := sql.Open("sqlite", "file:"+filepath.Join(restored, "data.db")+"?mode=ro")
	if err != nil {
		return nil, err
	}
	defer db.Close()
	var integrity string
	if err := db.QueryRow("PRAGMA integrity_check;").Scan(&integrity); err != nil {
		return nil, err
	}
	if integrity != "ok" {
		return nil, fail("BACKUP_INTEGRITY_FAILED", 500)
	}
	counts := map[string]int{}
	for _, table := range backupTables(scope) {
		var count int
		if err := db.QueryRow("SELECT count(*) FROM " + table).Scan(&count); err != nil {
			return nil, err
		}
		counts[table] = count
	}
	sum, err := fileSHA256(archive)
	if err != nil {
		return nil, err
	}
	report := map[string]any{"scope": scope, "sourceUrl": source, "archive": archive, "restored": restored, "sha256": sum,
		"integrity": integrity, "counts": counts, "verifiedAt": nowISO(), "destructiveRestorePerformed": false}
	reportPath := archive + ".verified.json"
	file, err := os.OpenFile(reportPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return nil, err
	}
	if _, err := file.Write(append(jsonIndent(report), '\n')); err != nil {
		file.Close()
		return nil, err
	}
	if err := file.Close(); err != nil {
		return nil, err
	}
	report["reportPath"] = reportPath
	return report, nil
}

func extract(entry *zip.File, target string) error {
	if err := os.MkdirAll(filepath.Dir(target), 0o700); err != nil {
		return err
	}
	source, err := entry.Open()
	if err != nil {
		return err
	}
	defer source.Close()
	file, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return err
	}
	if _, err := io.Copy(file, source); err != nil {
		file.Close()
		return err
	}
	return file.Close()
}

func fileSHA256(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

var imageDigest = regexp.MustCompile(`^.+@sha256:[a-f0-9]{64}$`)

// Preflight checks what can be checked before live traffic; it builds, switches and charges nothing.
func Preflight(env map[string]string) (map[string]any, error) {
	cfg, err := LoadConfig(env)
	if err != nil {
		return nil, err
	}
	if !cfg.Live {
		return nil, fail("LIVE_CONFIGURATION_NOT_READY", 400)
	}
	if _, err := LiveCredentials(cfg.CredentialFile); err != nil {
		return nil, err
	}
	if !imageDigest.MatchString(env["PAY_IMAGE"]) {
		return nil, fail("IMMUTABLE_IMAGE_REQUIRED", 400)
	}
	if env["PAY_CALLBACK_VERIFIED"] != "true" || env["PAY_DEVICE_ACCEPTANCE"] != "true" || env["PAY_NEXT_DAY_BILL_ACCEPTANCE"] != "true" {
		return nil, fail("EXTERNAL_ACCEPTANCE_REQUIRED", 400)
	}
	for _, check := range [][3]string{{"payment", "PAY_BACKUP_REPORT", env["PAY_PB_URL"]}, {"business", "BUSINESS_BACKUP_REPORT", env["PB_URL"]}} {
		path := env[check[1]]
		if !strings.HasPrefix(path, "/") {
			return nil, fail("BACKUP_REPORT_REQUIRED", 400)
		}
		raw, err := os.ReadFile(path)
		if err != nil {
			return nil, err
		}
		var report struct{ Scope, SourceURL, Integrity, VerifiedAt, Archive, SHA256 string }
		if err := json.Unmarshal(raw, &report); err != nil {
			return nil, err
		}
		verified, ok := parseTime(report.VerifiedAt)
		age := time.Since(verified)
		sum, sumErr := fileSHA256(report.Archive)
		if report.Scope != check[0] || report.SourceURL != strings.TrimRight(check[2], "/") || report.Integrity != "ok" ||
			!ok || age < 0 || age >= 24*time.Hour || sumErr != nil || sum != report.SHA256 {
			return nil, fail("BACKUP_REPORT_INVALID", 400)
		}
	}
	status, err := exec.Command("git", "status", "--porcelain").Output()
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(string(status)) != "" {
		return nil, fail("UNCOMMITTED_RELEASE_CHANGES", 400)
	}
	return map[string]any{"configuration": "passed", "backups": "verified", "liveChargePerformed": false, "trafficSwitched": false}, nil
}
