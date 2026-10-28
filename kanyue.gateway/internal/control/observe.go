package control

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"

	"kanyue.gateway/internal/schema"
	"kanyue.gateway/internal/telemetry"
)

// telemetryFile sits next to the configuration database, separate from it.
const telemetryFile = "telemetry.db"

// Backup is a service's last backup result, as its heartbeat reports it.
type Backup struct {
	At    time.Time `json:"at"`
	OK    bool      `json:"ok"`
	Name  string    `json:"name,omitempty"`
	Error string    `json:"error,omitempty"`
	Cron  string    `json:"cron,omitempty"`
}

// Report is the latest heartbeat-borne state of one service.
type Report struct {
	Service string             `json:"service"`
	At      time.Time          `json:"at"`
	Gauges  map[string]float64 `json:"gauges,omitempty"`
	Backup  *Backup            `json:"backup,omitempty"`
}

// observer holds the gateway's telemetry and what services last reported.
type observer struct {
	tel       atomic.Pointer[telemetry.Telemetry]
	reports   sync.Map // service name → Report
	ownBackup atomic.Pointer[Backup]
}

// Telemetry is nil until the gateway serves.
func (c *Control) Telemetry() *telemetry.Telemetry { return c.obs.tel.Load() }

// openTelemetry starts the request log, metrics and exports for this process.
func (c *Control) openTelemetry(ctx context.Context) error {
	tel, err := telemetry.Open(telemetry.Options{Path: filepath.Join(c.app.DataDir(), telemetryFile),
		Sample: c.cfg.LogSample, Slow: c.cfg.LogSlow, TruncateIP: c.cfg.LogTruncateIP,
		LogRetention: c.cfg.LogRetention, MetricRetention: c.cfg.MetricRetention})
	if err != nil {
		return err
	}
	c.useTelemetry(tel)
	done := make(chan struct{})
	go func() {
		defer close(done)
		tel.Run(ctx)
	}()
	// The later hooks cancel ctx and drain the data plane; the final flush follows them.
	c.app.OnTerminate().BindFunc(func(e *core.TerminateEvent) error {
		err := e.Next()
		<-done
		tel.Flush(time.Now().Add(time.Minute)) // what the drain recorded
		tel.SetExports(nil)
		tel.Close()
		return err
	})
	return nil
}

// useTelemetry connects tel to the data plane and loads the exporters.
func (c *Control) useTelemetry(tel *telemetry.Telemetry) {
	c.obs.tel.Store(tel)
	c.handler.SetRecorder(tel)
	if err := c.reloadExports(); err != nil {
		c.app.Logger().Error("Log exports not loaded", "error", err.Error())
	}
}

func (c *Control) report(beat Beat, now time.Time) {
	previous, _ := c.obs.reports.Load(beat.Service)
	next := Report{Service: beat.Service, At: now, Gauges: beat.Gauges, Backup: beat.Backup}
	if old, ok := previous.(Report); ok && next.Backup == nil {
		next.Backup = old.Backup // a restarted service reports its backup again later
	}
	c.obs.reports.Store(beat.Service, next)
	if tel := c.Telemetry(); tel != nil && len(beat.Outbound) > 0 {
		if err := tel.AddOutbound(beat.Service, beat.Outbound, now); err != nil {
			c.app.Logger().Warn("Outbound calls not stored", "service", beat.Service, "error", err.Error())
		}
	}
}

// Reports lists the latest state of every reporting service, with the gateway's own backup.
func (c *Control) Reports() []Report {
	var out []Report
	c.obs.reports.Range(func(_, value any) bool {
		out = append(out, value.(Report))
		return true
	})
	out = append(out, Report{Service: "kanyue.gateway", At: time.Now(), Backup: c.obs.ownBackup.Load()})
	return out
}

// exporterOf builds the exporter a record describes, opening its sealed secret.
func (c *Control) exporterOf(record *core.Record) (telemetry.Exporter, error) {
	secret := ""
	if sealed := record.GetString("secret"); sealed != "" {
		plain, err := c.open(sealed)
		if err != nil {
			return nil, err
		}
		secret = plain
	}
	var username, password, token string
	switch record.GetString("auth") {
	case "basic":
		username, password = record.GetString("username"), secret
	case "bearer":
		token = secret
	}
	if record.GetString("format") == "otlp-traces" {
		return &telemetry.OTLPTraces{URL: record.GetString("url"), Username: username, Password: password, Token: token}, nil
	}
	exporter := &telemetry.JSONLines{URL: record.GetString("url"), Username: username, Password: password, Token: token}
	if fields := strings.TrimSpace(record.GetString("streamFields")); fields != "" {
		exporter.StreamFields = strings.Split(fields, ",")
	}
	return exporter, nil
}

// ProbeExporter sends a marked test record and stores the outcome on the exporter.
func (c *Control) ProbeExporter(ctx context.Context, record *core.Record) error {
	exporter, err := c.exporterOf(record)
	if err == nil {
		probe, cancel := context.WithTimeout(ctx, 10*time.Second)
		err = exporter.Probe(probe)
		cancel()
	}
	record.Set("probedAt", types.NowDateTime())
	record.Set("probeError", "")
	if err != nil {
		record.Set("probeError", truncate(err.Error(), 500))
	}
	return err
}

// reloadExports replaces the running exports with the enabled exporters.
func (c *Control) reloadExports() error {
	tel := c.Telemetry()
	if tel == nil {
		return nil
	}
	records, err := c.app.FindAllRecords(schema.Exporters, dbx.HashExp{"enabled": true})
	if err != nil {
		return err
	}
	var configs []telemetry.ExportConfig
	var errs []error
	for _, record := range records {
		exporter, err := c.exporterOf(record)
		if err != nil {
			errs = append(errs, fmt.Errorf("exporter %q: %w", record.GetString("name"), err))
			continue
		}
		sample := record.GetFloat("sample")
		if sample <= 0 { // unset: export every record
			sample = 1
		}
		configs = append(configs, telemetry.ExportConfig{Name: record.GetString("name"), Exporter: exporter,
			Sample: sample, OnlyErrors: record.GetBool("onlyErrors")})
	}
	tel.SetExports(configs)
	return errors.Join(errs...)
}

// bindObservability probes an exporter before it can be enabled, reloads the
// exports on change, and records the gateway's own backups.
func (c *Control) bindObservability() {
	c.app.OnRecordUpdate(schema.Exporters).BindFunc(func(e *core.RecordEvent) error {
		return c.probeOnEnable(e)
	})
	c.app.OnRecordCreate(schema.Exporters).BindFunc(func(e *core.RecordEvent) error {
		return c.probeOnEnable(e)
	})
	reload := func(e *core.RecordEvent) error {
		if err := c.reloadExports(); err != nil {
			c.app.Logger().Error("Log exports not reloaded", "error", err.Error())
		}
		return e.Next()
	}
	c.app.OnRecordAfterCreateSuccess(schema.Exporters).BindFunc(reload)
	c.app.OnRecordAfterUpdateSuccess(schema.Exporters).BindFunc(reload)
	c.app.OnRecordAfterDeleteSuccess(schema.Exporters).BindFunc(reload)

	c.app.OnBackupCreate().BindFunc(func(e *core.BackupEvent) error {
		err := e.Next()
		backup := &Backup{At: time.Now().UTC(), OK: err == nil, Name: e.Name, Cron: e.App.Settings().Backups.Cron}
		if err != nil {
			backup.Error = err.Error()
		}
		c.obs.ownBackup.Store(backup)
		return err
	})
}

// configureBackups applies BACKUP_CRON, BACKUP_KEEP and BACKUP_S3_* to the
// gateway's own scheduled backups, like gatewaylink.ConfigureBackups does in
// kanyue.server and kanyue.pay. Without BACKUP_CRON the dashboard settings stay.
func (c *Control) configureBackups(getenv func(string) string) error {
	cron := getenv("BACKUP_CRON")
	if cron == "" {
		return nil
	}
	settings, err := c.app.Settings().Clone()
	if err != nil {
		return err
	}
	settings.Backups.Cron, settings.Backups.CronMaxKeep = cron, 7
	if keep := getenv("BACKUP_KEEP"); keep != "" {
		if _, err := fmt.Sscan(keep, &settings.Backups.CronMaxKeep); err != nil || settings.Backups.CronMaxKeep < 1 {
			return errors.New("BACKUP_KEEP must be a positive number")
		}
	}
	if endpoint := getenv("BACKUP_S3_ENDPOINT"); endpoint != "" {
		if _, err := c.masterKey(); err != nil {
			return fmt.Errorf("S3 backups store their secret encrypted: %w", err)
		}
		settings.Backups.S3 = core.S3Config{Enabled: true, Endpoint: endpoint, Bucket: getenv("BACKUP_S3_BUCKET"),
			Region: getenv("BACKUP_S3_REGION"), AccessKey: getenv("BACKUP_S3_ACCESS_KEY"), Secret: getenv("BACKUP_S3_SECRET"),
			ForcePathStyle: getenv("BACKUP_S3_FORCE_PATH_STYLE") == "1"}
	}
	if err := c.app.Save(settings); err != nil {
		return fmt.Errorf("backup settings: %w", err)
	}
	return nil
}

// probeOnEnable runs the connection test when an exporter is saved enabled with
// a changed target; a failing target is refused and stays as it was.
func (c *Control) probeOnEnable(e *core.RecordEvent) error {
	record := e.Record
	original := record.Original()
	changed := record.IsNew() || !original.GetBool("enabled")
	for _, field := range []string{"url", "auth", "username", "secret", "streamFields"} {
		changed = changed || record.GetString(field) != original.GetString(field)
	}
	if record.GetBool("enabled") && changed {
		// The sealing hook runs first, so the secret here is already sealed.
		if err := c.ProbeExporter(context.Background(), record); err != nil {
			return fmt.Errorf("connection test failed, exporter not enabled: %w", err)
		}
	}
	return e.Next()
}
