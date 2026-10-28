package control

import (
	"cmp"
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.gateway/internal/schema"
	"kanyue.gateway/internal/telemetry"
)

// The console's observability API. Times are RFC 3339 or Unix milliseconds;
// the default range is the last hour.

func timeParam(e *core.RequestEvent, name string, fallback time.Time) time.Time {
	raw := e.Request.URL.Query().Get(name)
	if raw == "" {
		return fallback
	}
	if ms, err := strconv.ParseInt(raw, 10, 64); err == nil {
		return time.UnixMilli(ms)
	}
	if at, err := time.Parse(time.RFC3339, raw); err == nil {
		return at
	}
	return fallback
}

func intParam(e *core.RequestEvent, name string) int {
	value, _ := strconv.Atoi(e.Request.URL.Query().Get(name))
	return value
}

func rangeOf(e *core.RequestEvent) (time.Time, time.Time) {
	to := timeParam(e, "to", time.Now())
	return timeParam(e, "from", to.Add(-time.Hour)), to
}

func (c *Control) withTelemetry(e *core.RequestEvent, read func(*telemetry.Telemetry) (any, error)) error {
	tel := c.Telemetry()
	if tel == nil {
		return e.JSON(http.StatusServiceUnavailable, map[string]any{"error": "telemetry is not running"})
	}
	out, err := read(tel)
	if err != nil {
		return err
	}
	return e.JSON(http.StatusOK, out)
}

func (c *Control) logsRoute(e *core.RequestEvent) error {
	from, to := rangeOf(e)
	query := e.Request.URL.Query()
	q := telemetry.LogQuery{From: from, To: to, Stage: query.Get("stage"), Group: query.Get("group"), Route: query.Get("route"), Service: query.Get("service"),
		Consumer: query.Get("consumer"), RequestID: query.Get("requestId"), PathPrefix: query.Get("path"),
		MinStatus: intParam(e, "minStatus"), MaxStatus: intParam(e, "maxStatus"), BeforeID: int64(intParam(e, "before")),
		Limit: cmp.Or(intParam(e, "limit"), 100)}
	return c.withTelemetry(e, func(tel *telemetry.Telemetry) (any, error) {
		var store telemetry.LogStore = tel
		return store.Requests(e.Request.Context(), q)
	})
}

func (c *Control) metricsRoute(e *core.RequestEvent) error {
	from, to := rangeOf(e)
	query := e.Request.URL.Query()
	return c.withTelemetry(e, func(tel *telemetry.Telemetry) (any, error) {
		return tel.Metrics(e.Request.Context(), from, to, telemetry.MetricQuery{Stage: query.Get("stage"), Group: query.Get("group"),
			Route: query.Get("route"), Service: query.Get("service")})
	})
}

// GraphEdge is traffic between two nodes: host → route → service from the
// gateway's own metrics, service → dependency from services' reports.
type GraphEdge struct {
	From     string  `json:"from"`
	To       string  `json:"to"`
	Kind     string  `json:"kind"` // route, upstream or outbound
	Count    int     `json:"count"`
	Errors   int     `json:"errors"`
	PerMin   float64 `json:"perMinute"`
	P95      float64 `json:"p95"`
	ErrRatio float64 `json:"errorRatio"`
}

func (c *Control) graphRoute(e *core.RequestEvent) error {
	from, to := rangeOf(e)
	return c.withTelemetry(e, func(tel *telemetry.Telemetry) (any, error) {
		return c.Graph(e.Request.Context(), tel, from, to)
	})
}

// Graph builds the dependency edges over [from, to).
func (c *Control) Graph(ctx context.Context, tel *telemetry.Telemetry, from, to time.Time) ([]GraphEdge, error) {
	minutes := max(to.Sub(from).Minutes(), 1)
	summaries, err := tel.Window(ctx, from, to)
	if err != nil {
		return nil, err
	}
	names := map[string]string{}
	if services, err := c.app.FindAllRecords(schema.Services); err == nil {
		for _, service := range services {
			names[service.Id] = service.GetString("name")
		}
	}
	edge := func(from, to, kind string, count, errors int, p95 float64) GraphEdge {
		ratio := 0.0
		if count > 0 {
			ratio = float64(errors) / float64(count)
		}
		return GraphEdge{From: from, To: to, Kind: kind, Count: count, Errors: errors, PerMin: float64(count) / minutes, P95: p95, ErrRatio: ratio}
	}
	var out []GraphEdge
	for _, s := range summaries {
		route := subjectOf(s)
		out = append(out, edge("gateway", "route:"+route, "route", s.Count, s.S5xx+s.Errors, s.P95))
		if s.Service != "" {
			service := names[s.Service]
			if service == "" {
				service = s.Service
			}
			out = append(out, edge("route:"+route, service, "upstream", s.Count, s.S5xx, s.P95))
		}
	}
	calls, err := tel.Calls(ctx, from, to)
	if err != nil {
		return nil, err
	}
	for _, call := range calls {
		out = append(out, edge(call.Source, call.Target, "outbound", call.Count, call.Failures, call.P95))
	}
	return out, nil
}

func (c *Control) eventsRoute(e *core.RequestEvent) error {
	return c.withTelemetry(e, func(tel *telemetry.Telemetry) (any, error) {
		return tel.Events(e.Request.Context(), e.Request.URL.Query().Get("kind"), cmp.Or(intParam(e, "limit"), 100))
	})
}

func (c *Control) reportsRoute(e *core.RequestEvent) error {
	return e.JSON(http.StatusOK, c.Reports())
}

// probeRoute runs an exporter's connection test without enabling it.
func (c *Control) probeRoute(e *core.RequestEvent) error {
	record, err := c.app.FindRecordById(schema.Exporters, e.Request.PathValue("id"))
	if err != nil {
		return e.NotFoundError("Exporter not found.", err)
	}
	probeErr := c.ProbeExporter(e.Request.Context(), record)
	if err := c.app.SaveNoValidate(record); err != nil {
		return err
	}
	if probeErr != nil {
		return e.JSON(http.StatusOK, map[string]any{"ok": false, "error": probeErr.Error()})
	}
	return e.JSON(http.StatusOK, map[string]any{"ok": true})
}

func (c *Control) telemetryStatus() map[string]any {
	tel := c.Telemetry()
	if tel == nil {
		return nil
	}
	return map[string]any{"dropped": tel.Dropped(), "exports": tel.Exports()}
}

// alertLoop evaluates the alert rules a few seconds after each minute, once its metrics are stored.
func (c *Control) alertLoop(ctx context.Context) {
	for {
		next := time.Now().Truncate(time.Minute).Add(time.Minute + 5*time.Second)
		select {
		case <-ctx.Done():
			return
		case <-time.After(time.Until(next)):
			if err := c.EvaluateAlerts(ctx, time.Now()); err != nil {
				c.app.Logger().Error("Alert evaluation failed", "error", err.Error())
			}
		}
	}
}
