// Package telemetry keeps what the data plane observed: request logs, per-minute
// route metrics and the outbound calls services report. It writes to its own
// SQLite file, never to the configuration database, and the data plane only
// ever hands it entries through a bounded queue: a slow disk drops and counts
// log entries, it never slows a request.
package telemetry

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand/v2"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"kanyue.gateway/internal/proxy"
)

// Bounds are the upper bounds in milliseconds of the latency buckets; one more bucket holds the rest.
var Bounds = []float64{1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000}

type Options struct {
	Path string
	// Sample is the share of fast, successful requests whose log entry is kept (0..1).
	Sample float64
	// Slow requests are always kept, like errors.
	Slow       time.Duration
	TruncateIP bool
	// LogRetention and MetricRetention bound how long rows are kept.
	LogRetention    time.Duration
	MetricRetention time.Duration
	Queue           int
}

// Record is one redacted log record as stored and exported. Requests fill the
// request fields; audit and alert events set Kind and Message.
type Record struct {
	ID         int64     `json:"id,omitempty" db:"id"`
	Time       time.Time `json:"time" db:"-"`
	Kind       string    `json:"kind" db:"-"`
	Message    string    `json:"message,omitempty" db:"-"`
	Host       string    `json:"host,omitempty" db:"host"`
	Stage      string    `json:"stage,omitempty" db:"stage"`
	Route      string    `json:"route,omitempty" db:"route"`
	Operation  string    `json:"operation,omitempty" db:"operation"`
	Service    string    `json:"service,omitempty" db:"service"`
	Instance   string    `json:"instance,omitempty" db:"instance"`
	Method     string    `json:"method,omitempty" db:"method"`
	Path       string    `json:"path,omitempty" db:"path"`
	Status     int       `json:"status,omitempty" db:"status"`
	DurationMs float64   `json:"durationMs,omitempty" db:"durationMs"`
	BytesIn    int64     `json:"bytesIn,omitempty" db:"bytesIn"`
	BytesOut   int64     `json:"bytesOut,omitempty" db:"bytesOut"`
	ClientIP   string    `json:"clientIp,omitempty" db:"clientIp"`
	Consumer   string    `json:"consumer,omitempty" db:"consumer"`
	TraceID    string    `json:"traceId,omitempty" db:"traceId"`
	RequestID  string    `json:"requestId,omitempty" db:"requestId"`
	Error      string    `json:"error,omitempty" db:"error"`
}

type metricKey struct {
	minute         int64
	route, service string
}

type series struct {
	Count, S2xx, S3xx, S4xx, S5xx, Errors int
	BytesIn, BytesOut                     int64
	Buckets                               []int
	Max                                   float64
}

func newSeries() *series { return &series{Buckets: make([]int, len(Bounds)+1)} }

func (s *series) add(r Record) {
	s.Count++
	switch {
	case r.Status >= 500:
		s.S5xx++
	case r.Status >= 400:
		s.S4xx++
	case r.Status >= 300:
		s.S3xx++
	case r.Status >= 200:
		s.S2xx++
	}
	if r.Error != "" {
		s.Errors++
	}
	s.BytesIn += r.BytesIn
	s.BytesOut += r.BytesOut
	s.Buckets[sort.SearchFloat64s(Bounds, r.DurationMs)]++
	s.Max = max(s.Max, r.DurationMs)
}

func (s *series) merge(o *series) {
	s.Count += o.Count
	s.S2xx, s.S3xx, s.S4xx, s.S5xx, s.Errors = s.S2xx+o.S2xx, s.S3xx+o.S3xx, s.S4xx+o.S4xx, s.S5xx+o.S5xx, s.Errors+o.Errors
	s.BytesIn += o.BytesIn
	s.BytesOut += o.BytesOut
	for i := range s.Buckets {
		s.Buckets[i] += o.Buckets[i]
	}
	s.Max = max(s.Max, o.Max)
}

// Percentile is the upper bound of the bucket holding the q-th request, capped by the slowest one.
func (s *series) Percentile(q float64) float64 {
	seen := 0
	for i, n := range s.Buckets {
		seen += n
		if s.Count > 0 && float64(seen) >= q*float64(s.Count) {
			if i < len(Bounds) {
				return min(Bounds[i], s.Max)
			}
			return s.Max
		}
	}
	return 0
}

type Telemetry struct {
	opts    Options
	db      *dbx.DB
	queue   chan Record
	dropped atomic.Int64
	random  func() float64

	mu      sync.Mutex
	minutes map[metricKey]*series

	exports atomic.Pointer[[]*Export]
}

const schemaSQL = `
CREATE TABLE IF NOT EXISTS requests (id INTEGER PRIMARY KEY, time INTEGER NOT NULL, host TEXT, stage TEXT, route TEXT,
	operation TEXT, service TEXT, instance TEXT, method TEXT, path TEXT, status INTEGER, durationMs REAL, bytesIn INTEGER,
	bytesOut INTEGER, clientIp TEXT, consumer TEXT, traceId TEXT, requestId TEXT, error TEXT);
CREATE INDEX IF NOT EXISTS idx_requests_time ON requests (time);
CREATE INDEX IF NOT EXISTS idx_requests_route_time ON requests (route, time);
CREATE INDEX IF NOT EXISTS idx_requests_request_id ON requests (requestId);
CREATE TABLE IF NOT EXISTS metrics (minute INTEGER NOT NULL, route TEXT NOT NULL, service TEXT NOT NULL, count INTEGER,
	s2xx INTEGER, s3xx INTEGER, s4xx INTEGER, s5xx INTEGER, errors INTEGER, bytesIn INTEGER, bytesOut INTEGER,
	p50 REAL, p95 REAL, p99 REAL, series TEXT, PRIMARY KEY (minute, route, service));
CREATE TABLE IF NOT EXISTS outbound (minute INTEGER NOT NULL, source TEXT NOT NULL, target TEXT NOT NULL, count INTEGER,
	failures INTEGER, p95 REAL, PRIMARY KEY (minute, source, target));
CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, time INTEGER NOT NULL, kind TEXT, message TEXT, detail TEXT);
CREATE INDEX IF NOT EXISTS idx_events_time ON events (time);
`

// Open creates or opens the telemetry database at opts.Path.
func Open(opts Options) (*Telemetry, error) {
	db, err := core.DefaultDBConnect(opts.Path)
	if err != nil {
		return nil, fmt.Errorf("telemetry: %w", err)
	}
	if _, err := db.NewQuery(schemaSQL).Execute(); err != nil {
		db.Close()
		return nil, fmt.Errorf("telemetry schema: %w", err)
	}
	if opts.Queue <= 0 {
		opts.Queue = 10000
	}
	t := &Telemetry{opts: opts, db: db, queue: make(chan Record, opts.Queue), random: rand.Float64,
		minutes: map[metricKey]*series{}}
	t.exports.Store(&[]*Export{})
	return t, nil
}

// Record takes a finished exchange from the data plane; it never blocks.
func (t *Telemetry) Record(e proxy.Entry) {
	r := redact(e, t.opts.TruncateIP)
	t.mu.Lock()
	key := metricKey{minute: r.Time.Unix() / 60, route: r.Route, service: r.Service}
	s := t.minutes[key]
	if s == nil {
		s = newSeries()
		t.minutes[key] = s
	}
	s.add(r)
	t.mu.Unlock()

	for _, export := range *t.exports.Load() {
		export.offer(r)
	}
	keep := r.Status >= 500 || r.Status == 0 || r.Error != "" || e.Duration >= t.opts.Slow || t.random() < t.opts.Sample
	if !keep {
		return
	}
	select {
	case t.queue <- r:
	default:
		t.dropped.Add(1)
	}
}

// Dropped counts log entries lost to a full queue since start.
func (t *Telemetry) Dropped() int64 { return t.dropped.Load() }

// Run writes queued entries every second, persists finished minutes and
// applies retention hourly, until ctx ends; then it flushes what it holds.
func (t *Telemetry) Run(ctx context.Context) {
	tick := time.NewTicker(time.Second)
	defer tick.Stop()
	var lastPurge time.Time
	for {
		select {
		case <-ctx.Done():
			t.Flush(time.Now().Add(time.Minute))
			return
		case now := <-tick.C:
			t.Flush(now)
			if now.Sub(lastPurge) >= time.Hour {
				if err := t.Purge(now); err == nil {
					lastPurge = now
				}
			}
		}
	}
}

// Flush writes the queued log entries and every metric minute that ended before now.
func (t *Telemetry) Flush(now time.Time) error {
	var batch []Record
	for len(batch) < 5000 {
		select {
		case r := <-t.queue:
			batch = append(batch, r)
			continue
		default:
		}
		break
	}
	current := now.Unix() / 60
	t.mu.Lock()
	finished := map[metricKey]*series{}
	for key, s := range t.minutes {
		if key.minute < current {
			finished[key] = s
			delete(t.minutes, key)
		}
	}
	t.mu.Unlock()
	if len(batch) == 0 && len(finished) == 0 {
		return nil
	}
	return t.db.Transactional(func(tx *dbx.Tx) error {
		for _, r := range batch {
			params := dbx.Params{"time": r.Time.UnixMilli()}
			for key, value := range dbParams(r) {
				params[key] = value
			}
			if _, err := tx.Insert("requests", params).Execute(); err != nil {
				return err
			}
		}
		for key, s := range finished {
			if err := upsertMinute(tx, key, s); err != nil {
				return err
			}
		}
		return nil
	})
}

func dbParams(r Record) dbx.Params {
	return dbx.Params{"host": r.Host, "stage": r.Stage, "route": r.Route, "operation": r.Operation, "service": r.Service,
		"instance": r.Instance, "method": r.Method, "path": r.Path, "status": r.Status, "durationMs": r.DurationMs,
		"bytesIn": r.BytesIn, "bytesOut": r.BytesOut, "clientIp": r.ClientIP, "consumer": r.Consumer,
		"traceId": r.TraceID, "requestId": r.RequestID, "error": r.Error}
}

// upsertMinute merges s into the stored minute, so a minute flushed twice (after a restart) adds up.
func upsertMinute(tx *dbx.Tx, key metricKey, s *series) error {
	var stored struct {
		Series string `db:"series"`
	}
	err := tx.Select("series").From("metrics").
		Where(dbx.HashExp{"minute": key.minute, "route": key.route, "service": key.service}).One(&stored)
	if err == nil {
		previous := newSeries()
		if json.Unmarshal([]byte(stored.Series), previous) == nil && len(previous.Buckets) == len(s.Buckets) {
			s.merge(previous)
		}
	}
	raw, _ := json.Marshal(s)
	_, err = tx.NewQuery(`INSERT OR REPLACE INTO metrics (minute, route, service, count, s2xx, s3xx, s4xx, s5xx, errors,
		bytesIn, bytesOut, p50, p95, p99, series) VALUES ({:minute}, {:route}, {:service}, {:count}, {:s2xx}, {:s3xx},
		{:s4xx}, {:s5xx}, {:errors}, {:bytesIn}, {:bytesOut}, {:p50}, {:p95}, {:p99}, {:series})`).Bind(dbx.Params{
		"minute": key.minute, "route": key.route, "service": key.service, "count": s.Count, "s2xx": s.S2xx,
		"s3xx": s.S3xx, "s4xx": s.S4xx, "s5xx": s.S5xx, "errors": s.Errors, "bytesIn": s.BytesIn, "bytesOut": s.BytesOut,
		"p50": s.Percentile(0.5), "p95": s.Percentile(0.95), "p99": s.Percentile(0.99), "series": string(raw)}).Execute()
	return err
}

// Purge deletes logs and events past the log retention and metrics past the metric retention.
func (t *Telemetry) Purge(now time.Time) error {
	logsBefore := now.Add(-t.opts.LogRetention).UnixMilli()
	minutesBefore := now.Add(-t.opts.MetricRetention).Unix() / 60
	return t.db.Transactional(func(tx *dbx.Tx) error {
		for _, step := range []struct {
			table string
			where dbx.Expression
		}{
			{"requests", dbx.NewExp("time < {:t}", dbx.Params{"t": logsBefore})},
			{"events", dbx.NewExp("time < {:t}", dbx.Params{"t": logsBefore})},
			{"metrics", dbx.NewExp("minute < {:m}", dbx.Params{"m": minutesBefore})},
			{"outbound", dbx.NewExp("minute < {:m}", dbx.Params{"m": minutesBefore})},
		} {
			if _, err := tx.Delete(step.table, step.where).Execute(); err != nil {
				return err
			}
		}
		return nil
	})
}

// Outbound is one service's calls to a dependency, as reported in its heartbeat.
type Outbound struct {
	Target   string  `json:"target"`
	Count    int     `json:"count"`
	Failures int     `json:"failures"`
	P95Ms    float64 `json:"p95Ms"`
}

// AddOutbound adds a heartbeat's outbound calls to the current minute of source.
func (t *Telemetry) AddOutbound(source string, calls []Outbound, at time.Time) error {
	minute := at.Unix() / 60
	for _, call := range calls {
		if call.Count <= 0 || call.Target == "" || len(call.Target) > 100 {
			continue
		}
		_, err := t.db.NewQuery(`INSERT INTO outbound (minute, source, target, count, failures, p95)
			VALUES ({:minute}, {:source}, {:target}, {:count}, {:failures}, {:p95})
			ON CONFLICT (minute, source, target) DO UPDATE SET count = count + excluded.count,
			failures = failures + excluded.failures, p95 = max(p95, excluded.p95)`).Bind(dbx.Params{
			"minute": minute, "source": source, "target": call.Target, "count": call.Count,
			"failures": min(call.Failures, call.Count), "p95": call.P95Ms}).Execute()
		if err != nil {
			return err
		}
	}
	return nil
}

// Event stores an audit or alert event and exports it.
func (t *Telemetry) Event(kind, message string, detail map[string]any, at time.Time) error {
	raw, _ := json.Marshal(detail)
	_, err := t.db.Insert("events", dbx.Params{"time": at.UnixMilli(), "kind": kind, "message": message,
		"detail": string(raw)}).Execute()
	for _, export := range *t.exports.Load() {
		export.offer(Record{Time: at, Kind: kind, Message: message})
	}
	return err
}

func (t *Telemetry) Close() error { return t.db.Close() }
