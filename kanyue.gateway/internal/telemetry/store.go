package telemetry

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
)

// LogQuery filters request logs; zero fields do not filter.
type LogQuery struct {
	From, To  time.Time
	Route     string
	Service   string
	Consumer  string
	RequestID string
	// PathPrefix matches the start of the redacted path.
	PathPrefix string
	MinStatus  int
	MaxStatus  int
	// BeforeID pages backwards from an earlier result.
	BeforeID int64
	Limit    int
}

// LogStore is how the console reads request logs; the local SQLite store is
// the only implementation for now, a VictoriaLogs reader can follow.
type LogStore interface {
	Requests(ctx context.Context, q LogQuery) ([]Record, error)
}

var _ LogStore = (*Telemetry)(nil)

type storedRecord struct {
	Record
	Millis int64 `db:"time"`
}

func (t *Telemetry) Requests(ctx context.Context, q LogQuery) ([]Record, error) {
	query := t.db.Select("*").From("requests").WithContext(ctx).OrderBy("id DESC").Limit(int64(min(max(q.Limit, 1), 500)))
	var where []dbx.Expression
	if !q.From.IsZero() {
		where = append(where, dbx.NewExp("time >= {:from}", dbx.Params{"from": q.From.UnixMilli()}))
	}
	if !q.To.IsZero() {
		where = append(where, dbx.NewExp("time < {:to}", dbx.Params{"to": q.To.UnixMilli()}))
	}
	for column, value := range map[string]string{"route": q.Route, "service": q.Service, "consumer": q.Consumer, "requestId": q.RequestID} {
		if value != "" {
			where = append(where, dbx.HashExp{column: value})
		}
	}
	if q.PathPrefix != "" {
		where = append(where, dbx.Like("path", strings.TrimSpace(q.PathPrefix)).Match(false, true))
	}
	if q.MinStatus > 0 {
		where = append(where, dbx.NewExp("status >= {:min}", dbx.Params{"min": q.MinStatus}))
	}
	if q.MaxStatus > 0 {
		where = append(where, dbx.NewExp("status <= {:max}", dbx.Params{"max": q.MaxStatus}))
	}
	if q.BeforeID > 0 {
		where = append(where, dbx.NewExp("id < {:before}", dbx.Params{"before": q.BeforeID}))
	}
	var rows []storedRecord
	if err := query.Where(dbx.And(where...)).All(&rows); err != nil {
		return nil, err
	}
	out := make([]Record, len(rows))
	for i, row := range rows {
		out[i] = row.Record
		out[i].Time = time.UnixMilli(row.Millis)
		out[i].Kind = "request"
	}
	return out, nil
}

// Minute is one route's traffic in one minute.
type Minute struct {
	Minute   time.Time `json:"minute" db:"-"`
	Route    string    `json:"route" db:"route"`
	Service  string    `json:"service" db:"service"`
	Count    int       `json:"count" db:"count"`
	S2xx     int       `json:"s2xx" db:"s2xx"`
	S3xx     int       `json:"s3xx" db:"s3xx"`
	S4xx     int       `json:"s4xx" db:"s4xx"`
	S5xx     int       `json:"s5xx" db:"s5xx"`
	Errors   int       `json:"errors" db:"errors"`
	BytesIn  int64     `json:"bytesIn" db:"bytesIn"`
	BytesOut int64     `json:"bytesOut" db:"bytesOut"`
	P50      float64   `json:"p50" db:"p50"`
	P95      float64   `json:"p95" db:"p95"`
	P99      float64   `json:"p99" db:"p99"`
}

// Metrics lists stored minutes in [from, to), optionally of one route or service.
func (t *Telemetry) Metrics(ctx context.Context, from, to time.Time, route, service string) ([]Minute, error) {
	var rows []struct {
		Minute
		At int64 `db:"minute"`
	}
	where := dbx.And(dbx.NewExp("minute >= {:from} AND minute < {:to}", dbx.Params{"from": from.Unix() / 60, "to": to.Unix() / 60}))
	if route != "" {
		where = dbx.And(where, dbx.HashExp{"route": route})
	}
	if service != "" {
		where = dbx.And(where, dbx.HashExp{"service": service})
	}
	err := t.db.Select("minute", "route", "service", "count", "s2xx", "s3xx", "s4xx", "s5xx", "errors", "bytesIn", "bytesOut",
		"p50", "p95", "p99").From("metrics").WithContext(ctx).Where(where).OrderBy("minute", "route").All(&rows)
	out := make([]Minute, len(rows))
	for i, row := range rows {
		out[i] = row.Minute
		out[i].Minute = time.Unix(row.At*60, 0)
	}
	return out, err
}

// Summary is traffic over a window, with percentiles from the merged buckets.
type Summary struct {
	Route    string  `json:"route"`
	Service  string  `json:"service"`
	Count    int     `json:"count"`
	S5xx     int     `json:"s5xx"`
	Errors   int     `json:"errors"`
	BytesOut int64   `json:"bytesOut"`
	P95      float64 `json:"p95"`
}

// Window summarizes every route over the stored minutes in [from, to).
func (t *Telemetry) Window(ctx context.Context, from, to time.Time) ([]Summary, error) {
	var rows []struct {
		Route   string `db:"route"`
		Service string `db:"service"`
		Series  string `db:"series"`
	}
	err := t.db.Select("route", "service", "series").From("metrics").WithContext(ctx).
		Where(dbx.NewExp("minute >= {:from} AND minute < {:to}", dbx.Params{"from": from.Unix() / 60, "to": to.Unix() / 60})).All(&rows)
	if err != nil {
		return nil, err
	}
	merged := map[[2]string]*series{}
	var keys [][2]string
	for _, row := range rows {
		s := newSeries()
		if json.Unmarshal([]byte(row.Series), s) != nil || len(s.Buckets) != len(Bounds)+1 {
			continue
		}
		key := [2]string{row.Route, row.Service}
		if merged[key] == nil {
			merged[key] = newSeries()
			keys = append(keys, key)
		}
		merged[key].merge(s)
	}
	out := make([]Summary, 0, len(keys))
	for _, key := range keys {
		s := merged[key]
		out = append(out, Summary{Route: key[0], Service: key[1], Count: s.Count, S5xx: s.S5xx, Errors: s.Errors,
			BytesOut: s.BytesOut, P95: s.Percentile(0.95)})
	}
	return out, nil
}

// Call is one dependency edge over a window.
type Call struct {
	Source   string  `json:"source" db:"source"`
	Target   string  `json:"target" db:"target"`
	Count    int     `json:"count" db:"count"`
	Failures int     `json:"failures" db:"failures"`
	P95      float64 `json:"p95" db:"p95"`
}

// Calls sums the reported outbound calls per source and target over [from, to);
// P95 is the worst minute's.
func (t *Telemetry) Calls(ctx context.Context, from, to time.Time) ([]Call, error) {
	var out []Call
	err := t.db.Select("source", "target", "sum(count) AS count", "sum(failures) AS failures", "max(p95) AS p95").
		From("outbound").WithContext(ctx).
		Where(dbx.NewExp("minute >= {:from} AND minute < {:to}", dbx.Params{"from": from.Unix() / 60, "to": to.Unix() / 60})).
		GroupBy("source", "target").OrderBy("source", "target").All(&out)
	return out, err
}

// Event is a stored audit or alert event.
type Event struct {
	ID      int64          `json:"id" db:"id"`
	Time    time.Time      `json:"time" db:"-"`
	Kind    string         `json:"kind" db:"kind"`
	Message string         `json:"message" db:"message"`
	Detail  map[string]any `json:"detail" db:"-"`
}

// Events lists the newest events, optionally of one kind.
func (t *Telemetry) Events(ctx context.Context, kind string, limit int) ([]Event, error) {
	var rows []struct {
		Event
		Millis int64  `db:"time"`
		Raw    string `db:"detail"`
	}
	query := t.db.Select("id", "time", "kind", "message", "detail").From("events").WithContext(ctx).
		OrderBy("id DESC").Limit(int64(min(max(limit, 1), 500)))
	if kind != "" {
		query = query.Where(dbx.HashExp{"kind": kind})
	}
	if err := query.All(&rows); err != nil {
		return nil, err
	}
	out := make([]Event, len(rows))
	for i, row := range rows {
		out[i] = row.Event
		out[i].Time = time.UnixMilli(row.Millis)
		json.Unmarshal([]byte(row.Raw), &out[i].Detail)
	}
	return out, nil
}
