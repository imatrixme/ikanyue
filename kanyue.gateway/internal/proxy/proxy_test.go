package proxy

import (
	"bufio"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"net/url"
	"strings"
	"testing"
	"time"

	"kanyue.gateway/internal/snapshot"
)

var loopback = []netip.Prefix{netip.MustParsePrefix("127.0.0.1/32"), netip.MustParsePrefix("::1/128")}

// gateway routes every path of one site to service "svc" and serves it over real TCP.
func gateway(t *testing.T, headerTimeoutMs int, instances ...snapshot.Instance) (*Handler, *httptest.Server) {
	t.Helper()
	h := New(loopback, slog.New(slog.NewTextHandler(io.Discard, nil)))
	routes, err := snapshot.Compile(snapshot.Config{Version: 1,
		Sites:    []snapshot.Site{{ID: "site", Name: "site", Hosts: []string{"*"}}},
		Services: []snapshot.Service{{ID: "svc", Name: "svc", HeaderTimeoutMs: headerTimeoutMs}},
		Routes: []snapshot.Route{{ID: "all", Name: "all", Site: "site", Service: "svc",
			Operations: []snapshot.Operation{{ID: "any", Path: "/{path...}"}, {ID: "missing", Method: "GET", Path: "/v1/gone"}}}},
	})
	if err != nil {
		t.Fatal(err)
	}
	endpoints, err := snapshot.NewEndpoints(instances)
	if err != nil {
		t.Fatal(err)
	}
	h.SetRoutes(routes)
	h.SetEndpoints(endpoints)
	front := httptest.NewServer(h)
	t.Cleanup(front.Close)
	return h, front
}

func upstream(t *testing.T, handler http.HandlerFunc) (*httptest.Server, snapshot.Instance) {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	return server, snapshot.Instance{Service: "svc", Stage: DefaultStage, Address: strings.TrimPrefix(server.URL, "http://")}
}

// Upstreams always see the forwarding headers, so kanyue.server keeps PocketBase's
// API hidden; a client cannot spoof its address past an untrusted hop.
func TestForwardingHeadersAreAlwaysSet(t *testing.T) {
	seen := make(chan http.Header, 4)
	_, instance := upstream(t, func(w http.ResponseWriter, r *http.Request) {
		seen <- r.Header.Clone()
		w.WriteHeader(http.StatusNoContent)
	})
	h, front := gateway(t, 0, instance)

	send := func(headers map[string]string) http.Header {
		request, _ := http.NewRequest(http.MethodGet, front.URL+"/api/collections/students/records", nil)
		for key, value := range headers {
			request.Header.Set(key, value)
		}
		res, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatal(err)
		}
		res.Body.Close()
		return <-seen
	}

	// The test client connects from 127.0.0.1, a trusted hop: forwarded values are read from the right.
	got := send(map[string]string{"X-Forwarded-For": "198.51.100.7, 203.0.113.9, 127.0.0.1", "X-Forwarded-Proto": "https",
		"X-Request-Id": "req-123", "traceparent": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"})
	if got.Get("X-Forwarded-For") != "203.0.113.9" || got.Get("X-Real-IP") != "203.0.113.9" ||
		got.Get("X-Forwarded-Proto") != "https" || got.Get("X-Request-Id") != "req-123" {
		t.Fatalf("trusted hop headers = %v", got)
	}
	if trace := got.Get("traceparent"); !strings.HasPrefix(trace, "00-4bf92f3577b34da6a3ce929d0e0e4736-") || strings.Contains(trace, "00f067aa0ba902b7") {
		t.Fatalf("traceparent = %s", trace)
	}

	// No forwarding headers from the client: the gateway still adds them.
	got = send(nil)
	if got.Get("X-Forwarded-For") != "127.0.0.1" || got.Get("X-Real-IP") != "127.0.0.1" || len(got.Get("X-Request-Id")) != 32 ||
		!strings.HasSuffix(got.Get("traceparent"), "-01") || got.Get("X-Forwarded-Proto") != "http" {
		t.Fatalf("minted headers = %v", got)
	}

	// Without trusted hops, a spoofed chain is ignored and the connecting address is used.
	h.trusted = nil
	got = send(map[string]string{"X-Forwarded-For": "198.51.100.7", "X-Real-IP": "198.51.100.7", "X-Forwarded-Proto": "https",
		"X-Request-Id": "bad id with spaces"})
	if got.Get("X-Forwarded-For") != "127.0.0.1" || got.Get("X-Real-IP") != "127.0.0.1" || got.Get("X-Forwarded-Proto") != "http" ||
		got.Get("X-Request-Id") == "bad id with spaces" {
		t.Fatalf("untrusted headers = %v", got)
	}
}

// X-Ca-Stage picks the stage's instances, RELEASE by default; failures answer in
// the business envelope with Aliyun's error header.
func TestStageSelectionAndGatewayErrors(t *testing.T) {
	_, release := upstream(t, func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, "release") })
	_, test := upstream(t, func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, "test") })
	test.Stage = "TEST"
	dead := snapshot.Instance{Service: "svc", Stage: "PRE", Address: "127.0.0.1:1"}
	_, front := gateway(t, 0, release, test, dead)

	get := func(path, stage string) (int, string, string) {
		request, _ := http.NewRequest(http.MethodGet, front.URL+path, nil)
		if stage != "" {
			request.Header.Set("X-Ca-Stage", stage)
		}
		res, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		body, _ := io.ReadAll(res.Body)
		return res.StatusCode, string(body), res.Header.Get("X-Ca-Error-Message")
	}
	for _, item := range []struct {
		stage, body string
		status      int
	}{{"", "release", 200}, {"RELEASE", "release", 200}, {"test", "test", 200}} {
		if status, body, _ := get("/v1/x", item.stage); status != item.status || body != item.body {
			t.Errorf("stage %q = %d %s", item.stage, status, body)
		}
	}
	if status, body, reason := get("/v1/x", "PREVIEW"); status != 503 || !strings.Contains(body, `"code":503`) ||
		reason != "No available instance for stage PREVIEW" {
		t.Errorf("unknown stage = %d %s %s", status, body, reason)
	}
	if status, body, reason := get("/v1/x", "PRE"); status != 502 || !strings.Contains(body, "服务暂不可用") || reason != "Upstream unavailable" {
		t.Errorf("dead upstream = %d %s %s", status, body, reason)
	}

	empty := New(loopback, slog.New(slog.NewTextHandler(io.Discard, nil)))
	recorder := httptest.NewRecorder()
	empty.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/v1/x", nil))
	if recorder.Code != 404 || !strings.Contains(recorder.Body.String(), "接口不存在") || recorder.Header().Get("X-Ca-Error-Message") != "No route matched" {
		t.Fatalf("unpublished gateway = %d %s", recorder.Code, recorder.Body.String())
	}
}

// Server-sent events reach the client as written, and the header timeout never
// cuts a stream that has already started.
func TestEventStreamsFlushAndOutliveTheHeaderTimeout(t *testing.T) {
	release := make(chan struct{})
	_, instance := upstream(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		io.WriteString(w, "data: one\n\n")
		w.(http.Flusher).Flush()
		<-release
		time.Sleep(150 * time.Millisecond) // past the 100 ms header timeout
		io.WriteString(w, "data: two\n\n")
	})
	_, front := gateway(t, 100, instance)

	res, err := http.Get(front.URL + "/events")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	reader := bufio.NewReader(res.Body)
	first, err := reader.ReadString('\n')
	if err != nil || first != "data: one\n" {
		t.Fatalf("first event = %q %v", first, err)
	}
	close(release)
	rest, _ := io.ReadAll(reader)
	if !strings.Contains(string(rest), "data: two") {
		t.Fatalf("rest = %q", rest)
	}
}

// An upstream that sends no headers within the service's timeout is a 504.
func TestSlowUpstreamTimesOut(t *testing.T) {
	stop := make(chan struct{})
	_, instance := upstream(t, func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-stop:
		case <-r.Context().Done():
		}
	})
	t.Cleanup(func() { close(stop) }) // runs before the upstream closes, which waits for this handler
	_, front := gateway(t, 50, instance)
	res, err := http.Get(front.URL + "/slow")
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != http.StatusGatewayTimeout || res.Header.Get("X-Ca-Error-Message") != "Upstream timeout" {
		t.Fatalf("slow = %d", res.StatusCode)
	}
}

// WebSocket upgrades are relayed both ways after the 101.
func TestWebSocketUpgradeRelaysFrames(t *testing.T) {
	_, instance := upstream(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Upgrade") != "websocket" || r.Header.Get("X-Forwarded-For") == "" {
			http.Error(w, "not an upgrade", http.StatusBadRequest)
			return
		}
		conn, buf, err := w.(http.Hijacker).Hijack()
		if err != nil {
			return
		}
		defer conn.Close()
		buf.WriteString("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n")
		buf.Flush()
		line, _ := buf.ReadString('\n')
		buf.WriteString("echo " + line)
		buf.Flush()
	})
	_, front := gateway(t, 0, instance)

	target, _ := url.Parse(front.URL)
	conn, err := net.Dial("tcp", target.Host)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	conn.SetDeadline(time.Now().Add(5 * time.Second))
	io.WriteString(conn, "GET /ws HTTP/1.1\r\nHost: "+target.Host+"\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"+
		"Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n")
	reader := bufio.NewReader(conn)
	res, err := http.ReadResponse(reader, nil)
	if err != nil || res.StatusCode != http.StatusSwitchingProtocols {
		t.Fatalf("upgrade = %v %v", res, err)
	}
	io.WriteString(conn, "ping\n")
	echo, err := reader.ReadString('\n')
	if err != nil || echo != "echo ping\n" {
		t.Fatalf("echo = %q %v", echo, err)
	}
}
