package control

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/archive"
	"github.com/pocketbase/pocketbase/tools/filesystem/blob"

	"kanyue.gateway/internal/policy"
	"kanyue.gateway/internal/proxy"
)

// BackupCheck is what a restore drill proved about one backup; it never carries secret values.
type BackupCheck struct {
	Backup    string         `json:"backup"`
	Storage   string         `json:"storage"` // s3 or local
	Size      int64          `json:"size"`
	Modified  time.Time      `json:"modified"`
	AgeHours  float64        `json:"ageHours"`
	Integrity string         `json:"integrity"`
	Versions  map[string]int `json:"versions"` // environment → released version that compiled
}

// VerifyBackup restores a backup from the configured backup storage (S3 when
// enabled) into a scratch directory and proves it would serve: the database
// passes an integrity check, migrates to this binary's schema, and every
// environment's latest released version compiles with the current key. An empty
// name picks the newest backup; a zero maxAge skips the freshness check.
// Nothing is served, the live data directory is only read, and the scratch
// directory is removed afterwards.
func (c *Control) VerifyBackup(name string, maxAge time.Duration) (BackupCheck, error) {
	check := BackupCheck{Storage: "local", Versions: map[string]int{}}
	if c.app.Settings().Backups.S3.Enabled {
		check.Storage = "s3"
	}
	fsys, err := c.app.NewBackupsFilesystem()
	if err != nil {
		return check, err
	}
	defer fsys.Close()
	objects, err := fsys.List("")
	if err != nil {
		return check, fmt.Errorf("listing %s backups: %w", check.Storage, err)
	}
	var chosen *blob.ListObject
	for _, object := range objects {
		if !strings.HasSuffix(object.Key, ".zip") || (name != "" && object.Key != name) {
			continue
		}
		if chosen == nil || object.ModTime.After(chosen.ModTime) {
			chosen = object
		}
	}
	if chosen == nil {
		if name != "" {
			return check, fmt.Errorf("no %s backup named %s", check.Storage, name)
		}
		return check, fmt.Errorf("no backups in %s storage", check.Storage)
	}
	check.Backup, check.Size, check.Modified = chosen.Key, chosen.Size, chosen.ModTime
	check.AgeHours = time.Since(chosen.ModTime).Hours()

	scratch, err := os.MkdirTemp("", "kanyue-gateway-restore-check-")
	if err != nil {
		return check, err
	}
	defer os.RemoveAll(scratch)
	zipPath := filepath.Join(scratch, "backup.zip")
	if err := download(fsys.GetReader, chosen.Key, zipPath); err != nil {
		return check, fmt.Errorf("downloading %s: %w", chosen.Key, err)
	}
	restoredDir := filepath.Join(scratch, "pb_data")
	if err := archive.Extract(zipPath, restoredDir); err != nil {
		return check, fmt.Errorf("extracting %s: %w", chosen.Key, err)
	}

	restoredApp := core.NewBaseApp(core.BaseAppConfig{DataDir: restoredDir, EncryptionEnv: c.app.EncryptionEnv()})
	if err := restoredApp.Bootstrap(); err != nil {
		return check, fmt.Errorf("opening the restored data: %w", err)
	}
	defer restoredApp.ResetBootstrapState()
	if err := restoredApp.DB().NewQuery("PRAGMA integrity_check").Row(&check.Integrity); err != nil {
		return check, err
	}
	if check.Integrity != "ok" {
		return check, fmt.Errorf("the restored database fails its integrity check: %s", check.Integrity)
	}
	if err := restoredApp.RunAllMigrations(); err != nil {
		return check, fmt.Errorf("migrating the restored data: %w", err)
	}
	restored := New(restoredApp, c.cfg, proxy.New(nil, c.app.Logger()))
	for _, stage := range policy.Stages {
		record, err := latestStageVersion(restoredApp, stage)
		if errors.Is(err, errNoVersion) {
			continue
		}
		if err == nil {
			_, err = restored.loadStage(stage)
		}
		if err != nil {
			return check, fmt.Errorf("%s does not load from the backup: %w", stage, err)
		}
		check.Versions[stage] = record.GetInt("version")
	}
	if maxAge > 0 && time.Since(chosen.ModTime) > maxAge {
		return check, fmt.Errorf("the backup restores, but it is %.0f hours old; backups are not being taken on schedule", check.AgeHours)
	}
	return check, nil
}

func download(open func(string) (*blob.Reader, error), key, path string) error {
	reader, err := open(key)
	if err != nil {
		return err
	}
	defer reader.Close()
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return err
	}
	if _, err := io.Copy(file, reader); err != nil {
		file.Close()
		return err
	}
	return file.Close()
}
