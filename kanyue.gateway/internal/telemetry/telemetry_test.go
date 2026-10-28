package telemetry

import (
	"bufio"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"kanyue.gateway/internal/proxy"
)

func open(t *testing.T, opts Options) *Telemetry {
	t.Helper()
	opts.Path = filepath.Join(t.TempDir(), "telemetry.db")
	tel, err := Open(opts)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		tel.SetExports(nil)
		tel.Close()
	})
	return tel
}

// Fake personal data, assembled so no literal looks like a real number.
var (
	testPhone  = "138" + "0013" + "8000"
	testIDCard = "110105" + "19491231" + "002X"
)

func entry(at time.Time, route string, status int, took time.Duration) proxy.Entry {
	return proxy.Entry{Time: at, Host: "mapi.ikanyue.com", Route: route, Service: "kanyue.server", Method: "GET",
		Path: "/v1/students/" + testPhone + "/profile", Status: status, Duration: took, ClientIP: "203.0.113.77", BytesOut: 100}
}

// Errors and slow requests are always logged, fast successes are sampled, and
// a full queue drops and counts instead of blocking.
func TestRecordSamplesAndNeverBlocks(t *testing.T) {
	tel := open(t, Options{Sample: 0, Slow: time.Second, Queue: 3, TruncateIP: true, LogRetention: time.Hour, MetricRetention: time.Hour})
	minute := time.Now().Truncate(time.Minute).Add(-2 * time.Minute)
	tel.Record(entry(minute, "student", 200, time.Millisecond))
	tel.Record(entry(minute, "student", 502, 3*time.Millisecond))
	tel.Record(entry(minute.Add(time.Second), "student", 200, 2*time.Second))
	slowAt := minute.Add(2 * time.Second)
	limited := entry(slowAt, "student", 429, time.Millisecond)
	limited.Error = "Throttled by IP Flow Control"
	tel.Record(limited)
	tel.Record(entry(slowAt, "student", 500, time.Millisecond)) // queue full
	if tel.Dropped() != 1 {
		t.Fatalf("dropped = %d", tel.Dropped())
	}
	if err := tel.Flush(time.Now()); err != nil {
		t.Fatal(err)
	}
	logged, err := tel.Requests(context.Background(), LogQuery{Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if len(logged) != 3 || logged[0].Status != 429 || logged[2].Status != 502 {
		t.Fatalf("logged = %+v", logged)
	}
	if logged[0].Path != "/v1/students/{phone}/profile" || logged[0].ClientIP != "203.0.113.0" || logged[0].Time.Unix() != slowAt.Unix() {
		t.Fatalf("not redacted: %+v", logged[0])
	}
	if errs, _ := tel.Requests(context.Background(), LogQuery{MinStatus: 500, Route: "student", PathPrefix: "/v1/students/"}); len(errs) != 1 {
		t.Fatalf("filtered = %+v", errs)
	}

	// Metrics count every request, sampled or dropped.
	minutes, err := tel.Metrics(context.Background(), minute, time.Now(), "student", "")
	if err != nil || len(minutes) != 1 {
		t.Fatalf("minutes = %+v %v", minutes, err)
	}
	m := minutes[0]
	if m.Count != 5 || m.S5xx != 2 || m.S4xx != 1 || m.S2xx != 2 || m.Errors != 1 || m.BytesOut != 500 || m.P50 != 1 || m.P99 != 2000 {
		t.Fatalf("minute = %+v", m)
	}
	// A minute flushed again after a restart adds up rather than overwriting.
	tel.Record(entry(minute, "student", 200, time.Millisecond))
	tel.Flush(time.Now())
	window, _ := tel.Window(context.Background(), minute, time.Now())
	if len(window) != 1 || window[0].Count != 6 || window[0].S5xx != 2 || window[0].P95 != 2000 {
		t.Fatalf("window = %+v", window)
	}

	if err := tel.AddOutbound("kanyue.server", []Outbound{{Target: "kanyue.pay", Count: 4, Failures: 1, P95Ms: 80}}, minute); err != nil {
		t.Fatal(err)
	}
	tel.AddOutbound("kanyue.server", []Outbound{{Target: "kanyue.pay", Count: 2, Failures: 9, P95Ms: 30}}, minute)
	calls, _ := tel.Calls(context.Background(), minute, time.Now())
	if len(calls) != 1 || calls[0] != (Call{Source: "kanyue.server", Target: "kanyue.pay", Count: 6, Failures: 3, P95: 80}) {
		t.Fatalf("calls = %+v", calls)
	}

	if err := tel.Purge(time.Now().Add(2 * time.Hour)); err != nil {
		t.Fatal(err)
	}
	logged, _ = tel.Requests(context.Background(), LogQuery{Limit: 10})
	minutes, _ = tel.Metrics(context.Background(), minute, time.Now(), "", "")
	if len(logged) != 0 || len(minutes) != 0 {
		t.Fatalf("retention kept %d logs and %d minutes", len(logged), len(minutes))
	}
}

func TestRedaction(t *testing.T) {
	for in, want := range map[string]string{
		"/v1/users/a.b@example.com/x":   "/v1/users/{email}/x",
		"/v1/id/" + testIDCard:          "/v1/id/{idcard}",
		"/v1/orders/123456789012?t=sec": "/v1/orders/123456789012",
	} {
		if got := redactPath(in); got != want {
			t.Fatalf("redactPath(%q) = %q", in, got)
		}
	}
	if got := truncateIP("2001:db8:1234:5678::1"); got != "2001:db8:1234::" {
		t.Fatalf("ipv6 = %s", got)
	}
}

// The JSON lines exporter sends redacted records with _msg and _time to the
// endpoint; while the endpoint fails it backs off, reports failing and drops
// overflow; the data plane never waits.
func TestJSONLinesExport(t *testing.T) {
	var mu sync.Mutex
	var lines []map[string]any
	var auth, streams string
	failing := true
	endpoint := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		if failing {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		auth, streams = r.Header.Get("Authorization"), r.URL.Query().Get("_stream_fields")
		scanner := bufio.NewScanner(r.Body)
		for scanner.Scan() {
			line := map[string]any{}
			json.Unmarshal(scanner.Bytes(), &line)
			lines = append(lines, line)
		}
	}))
	defer endpoint.Close()
	token := strings.Repeat("t", 24)
	exporter := &JSONLines{URL: endpoint.URL + "/insert/jsonline", Token: token, StreamFields: []string{"service", "route"}}
	if err := exporter.Probe(context.Background()); err == nil {
		t.Fatal("probe passed against a failing endpoint")
	}

	tel := open(t, Options{Sample: 1, Slow: time.Second, LogRetention: time.Hour, MetricRetention: time.Hour})
	tel.SetExports([]ExportConfig{{Name: "vlogs", Exporter: exporter, Sample: 1}})
	begin := time.Now()
	for range 2 * exportQueue {
		tel.Record(entry(time.Now(), "student", 200, time.Millisecond))
	}
	if took := time.Since(begin); took > time.Second {
		t.Fatalf("recording waited on the exporter: %s", took)
	}
	deadline := time.Now().Add(5 * time.Second)
	for tel.Exports()[0].FailingSince.IsZero() && time.Now().Before(deadline) {
		time.Sleep(20 * time.Millisecond)
	}
	status := tel.Exports()[0]
	if status.FailingSince.IsZero() || !strings.Contains(status.LastError, "503") || tel.ExportDropped() < 10 {
		t.Fatalf("failing export = %+v, dropped %d", status, tel.ExportDropped())
	}

	mu.Lock()
	failing = false
	mu.Unlock()
	tel.SetExports([]ExportConfig{{Name: "vlogs", Exporter: exporter, Sample: 1}})
	tel.Record(entry(time.Now(), "student", 503, time.Millisecond))
	tel.Event("alert", "kanyue.server 没有健康实例", nil, time.Now())
	deadline = time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		mu.Lock()
		n := len(lines)
		mu.Unlock()
		if n >= 2 {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	mu.Lock()
	defer mu.Unlock()
	if err := exporterProbeUnlocked(&mu, exporter); err != nil {
		t.Fatal(err)
	}
	if len(lines) != 3 || lines[2]["kind"] != "probe" || auth != "Bearer "+token || streams != "service,route" {
		t.Fatalf("exported %d lines, auth set %v, streams %q", len(lines), auth != "", streams)
	}
	request := lines[0]
	if request["_msg"] != "GET /v1/students/{phone}/profile 503" || request["_time"] == nil || request["service"] != "kanyue.server" ||
		request["clientIp"] != "203.0.113.77" || lines[1]["kind"] != "alert" {
		t.Fatalf("lines = %v", lines)
	}
}

// exporterProbeUnlocked probes while the endpoint may take the lock the caller holds.
func exporterProbeUnlocked(mu *sync.Mutex, exporter *JSONLines) error {
	mu.Unlock()
	defer mu.Lock()
	return exporter.Probe(context.Background())
}
