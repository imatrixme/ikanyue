package telemetry

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

// The scrape counts every request since start, sampled out of the log or not,
// with a cumulative latency histogram in seconds.
func TestPrometheusCountsEveryRequest(t *testing.T) {
	tel := open(t, Options{Sample: 0, Slow: time.Second, LogRetention: time.Hour, MetricRetention: time.Hour})
	now := time.Now()
	tel.Record(entry(now, "student", 200, 3*time.Millisecond))
	tel.Record(entry(now, "student", 200, 40*time.Millisecond))
	tel.Record(entry(now.Add(-2*time.Minute), "student", 503, 2*time.Second))
	odd := entry(now, `say "hi"`, 404, time.Millisecond)
	tel.Record(odd)
	tel.Flush(now.Add(time.Hour)) // persisting the minutes leaves the totals alone

	var out bytes.Buffer
	tel.WritePrometheus(NewExposition(&out))
	text := out.String()
	student := `stage="RELEASE",group="mapi",api="student",service="kanyue.server"`
	for _, line := range []string{
		"# TYPE kanyue_gateway_requests_total counter",
		`kanyue_gateway_requests_total{` + student + `,code="2xx"} 2`,
		`kanyue_gateway_requests_total{` + student + `,code="5xx"} 1`,
		`kanyue_gateway_requests_total{stage="RELEASE",group="mapi",api="say \"hi\"",service="kanyue.server",code="4xx"} 1`,
		"# TYPE kanyue_gateway_request_duration_seconds histogram",
		`kanyue_gateway_request_duration_seconds_bucket{` + student + `,le="0.005"} 1`,
		`kanyue_gateway_request_duration_seconds_bucket{` + student + `,le="0.05"} 2`,
		`kanyue_gateway_request_duration_seconds_bucket{` + student + `,le="+Inf"} 3`,
		`kanyue_gateway_request_duration_seconds_sum{` + student + `} 2.043`,
		`kanyue_gateway_request_duration_seconds_count{` + student + `} 3`,
		`kanyue_gateway_sent_bytes_total{` + student + `} 300`,
		"kanyue_gateway_log_dropped_total 0",
		"# TYPE kanyue_gateway_telemetry_bytes gauge",
	} {
		if !strings.Contains(text, line+"\n") {
			t.Errorf("missing %s in\n%s", line, text)
		}
	}
	if !strings.Contains(text, "kanyue_gateway_telemetry_bytes ") || strings.Contains(text, "kanyue_gateway_telemetry_bytes 0\n") {
		t.Errorf("telemetry size missing in\n%s", text)
	}
	if strings.Count(text, "# TYPE kanyue_gateway_requests_total") != 1 {
		t.Error("a family is declared twice")
	}
}

// Request records become server spans under the caller's span; events are not traces.
func TestOTLPTracesExport(t *testing.T) {
	var mu sync.Mutex
	var bodies [][]byte
	endpoint := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		if r.URL.Path != "/v1/traces" || r.Header.Get("Content-Type") != "application/json" {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		body, _ := io.ReadAll(r.Body)
		bodies = append(bodies, body)
	}))
	defer endpoint.Close()
	exporter := &OTLPTraces{URL: endpoint.URL + "/v1/traces"}

	at := time.UnixMilli(1_800_000_000_000)
	failed := entry(at, "student", 503, 1500*time.Millisecond)
	failed.Operation, failed.Error = "GET /v1/students/{id}/profile", "Upstream unavailable"
	failed.TraceID, failed.SpanID, failed.ParentSpanID = strings.Repeat("ab", 16), strings.Repeat("cd", 8), strings.Repeat("ef", 8)
	ok := entry(at, "student", 200, time.Millisecond)
	ok.TraceID, ok.SpanID = strings.Repeat("12", 16), strings.Repeat("34", 8)
	untraced := entry(at, "student", 200, time.Millisecond)
	batch := []Record{redact(failed, false), redact(ok, false), redact(untraced, false), {Time: at, Kind: "alert", Message: "x"}}
	if err := exporter.Export(context.Background(), batch); err != nil {
		t.Fatal(err)
	}
	if err := exporter.Export(context.Background(), batch[3:]); err != nil {
		t.Fatal(err)
	}
	if err := exporter.Probe(context.Background()); err != nil {
		t.Fatal(err)
	}
	mu.Lock()
	defer mu.Unlock()
	if len(bodies) != 2 {
		t.Fatalf("posted %d batches, want the spans and the probe", len(bodies))
	}
	var doc struct {
		ResourceSpans []struct {
			Resource struct {
				Attributes []otlpAttribute `json:"attributes"`
			} `json:"resource"`
			ScopeSpans []struct {
				Spans []otlpSpan `json:"spans"`
			} `json:"scopeSpans"`
		} `json:"resourceSpans"`
	}
	if err := json.Unmarshal(bodies[0], &doc); err != nil {
		t.Fatal(err)
	}
	spans := doc.ResourceSpans[0].ScopeSpans[0].Spans
	if len(spans) != 2 || *doc.ResourceSpans[0].Resource.Attributes[0].Value.StringValue != "kanyue.gateway" {
		t.Fatalf("spans = %+v", spans)
	}
	s := spans[0]
	attributes := map[string]otlpValue{}
	for _, attribute := range s.Attributes {
		attributes[attribute.Key] = attribute.Value
	}
	if s.TraceID != failed.TraceID || s.SpanID != failed.SpanID || s.ParentSpanID != failed.ParentSpanID || s.Kind != spanKindServer ||
		s.Name != "GET /v1/students/{id}/profile" || s.StartTimeUnixNano != "1800000000000000000" || s.EndTimeUnixNano != "1800000001500000000" ||
		s.Status.Code != spanStatusError || s.Status.Message != "Upstream unavailable" {
		t.Fatalf("span = %+v", s)
	}
	if *attributes["http.response.status_code"].IntValue != "503" || *attributes["http.route"].StringValue != "/v1/students/{id}/profile" ||
		*attributes["url.path"].StringValue != "/v1/students/{phone}/profile" || *attributes["kanyue.stage"].StringValue != "RELEASE" {
		t.Fatalf("attributes = %v", s.Attributes)
	}
	if spans[1].Status.Code != 0 || spans[1].ParentSpanID != "" {
		t.Fatalf("successful root span = %+v", spans[1])
	}
	if !strings.Contains(string(bodies[1]), "kanyue.gateway export probe") {
		t.Fatalf("probe = %s", bodies[1])
	}
}
