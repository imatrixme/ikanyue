package proxy

import (
	"bufio"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"kanyue.gateway/internal/plugin"
	"kanyue.gateway/internal/snapshot"
)

type entries struct {
	mu   sync.Mutex
	list []Entry
}

func (e *entries) Record(entry Entry) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.list = append(e.list, entry)
}

func (e *entries) last() Entry {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.list[len(e.list)-1]
}

func routeBinding(name, config string) snapshot.Binding {
	return snapshot.Binding{Binding: plugin.Binding{Plugin: name, Config: json.RawMessage(config)}, Scope: "route", Target: "all"}
}

func do(t *testing.T, method, url string, header map[string]string, body io.Reader) (*http.Response, string) {
	t.Helper()
	request, _ := http.NewRequest(method, url, body)
	for key, value := range header {
		request.Header.Set(key, value)
	}
	res, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	return res, string(raw)
}

// A rejecting plugin answers without calling the upstream; identity the gateway
// asserts reaches the upstream, and clients cannot forge it.
func TestChainAnswersBeforeTheUpstreamAndAssertsIdentity(t *testing.T) {
	var calls atomic.Int32
	seen := make(chan http.Header, 1)
	_, instance := upstream(t, func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		seen <- r.Header.Clone()
		w.Header().Set("Access-Control-Allow-Origin", "*")
	})
	log := &entries{}
	h, front := gatewayWith(t, func(cfg *snapshot.Config) {
		cfg.Bindings = []snapshot.Binding{
			routeBinding("rate-limit", `{"limit":1,"window":"minute","by":"ip"}`),
			routeBinding("request-rewrite", `{"setHeaders":{"X-Kanyue-User":"forged"}}`),
			routeBinding("cors", `{"allowOrigins":["https://www.ikanyue.com"]}`),
		}
	}, instance)
	h.SetRecorder(log)

	res, _ := do(t, "GET", front.URL+"/v1/x", map[string]string{"X-Kanyue-Consumer": "admin", "Origin": "https://www.ikanyue.com"}, nil)
	got := <-seen
	if got.Get("X-Kanyue-Consumer") != "" || got.Get("X-Kanyue-User") != "" {
		t.Fatalf("forged identity reached the upstream: %v", got)
	}
	if res.Header.Get("Access-Control-Allow-Origin") != "https://www.ikanyue.com" || len(res.Header.Get("X-Ca-Request-Id")) != 32 {
		t.Fatalf("response headers = %v", res.Header)
	}
	res, body := do(t, "GET", front.URL+"/v1/x", nil, nil)
	if res.StatusCode != 429 || !strings.Contains(body, "请求过于频繁") || calls.Load() != 1 {
		t.Fatalf("limited request = %d %s, upstream calls %d", res.StatusCode, body, calls.Load())
	}
	if entry := log.last(); entry.Status != 429 || entry.Route != "all" || entry.Error != "Throttled by IP Flow Control" || entry.Instance != "" {
		t.Fatalf("log entry = %+v", entry)
	}
}

// An idempotent request moves to another instance after a 503 or a refused
// connection; a POST does not, and a fallback replaces the failure.
func TestRetryOnlyIdempotentAndFallback(t *testing.T) {
	_, bad := upstream(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	})
	_, good := upstream(t, func(w http.ResponseWriter, r *http.Request) {
		io.WriteString(w, "ok")
	})
	dead := snapshot.Instance{Service: "svc", Stage: DefaultStage, Address: "127.0.0.1:1"}
	_, refusing := gateway(t, 0, dead, good)
	_, front := gateway(t, 0, bad, good)

	for _, url := range []string{front.URL, refusing.URL} {
		for range 6 {
			if res, body := do(t, "GET", url+"/v1/x", nil, nil); res.StatusCode != 200 || body != "ok" {
				t.Fatalf("GET = %d %s", res.StatusCode, body)
			}
		}
	}
	// A fresh pool: the GETs above got the failing instance ejected.
	_, posting := gateway(t, 0, bad, good)
	failed := 0
	for range 2 {
		if res, _ := do(t, "POST", posting.URL+"/v1/x", nil, strings.NewReader("{}")); res.StatusCode == http.StatusServiceUnavailable {
			failed++
		}
	}
	if failed != 1 {
		t.Fatalf("%d of 2 POSTs failed; round robin sends one to the failing instance and it must not be retried", failed)
	}

	_, broken := upstream(t, func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusInternalServerError) })
	_, degraded := gatewayWith(t, func(cfg *snapshot.Config) {
		cfg.Bindings = []snapshot.Binding{routeBinding("fallback", `{"status":200,"body":"{\"code\":10000,\"data\":null}"}`)}
	}, broken)
	if res, body := do(t, "POST", degraded.URL+"/v1/x", nil, nil); res.StatusCode != 200 || body != `{"code":10000,"data":null}` ||
		res.Header.Get("X-Ca-Error-Message") != "Fallback" {
		t.Fatalf("fallback = %d %s %v", res.StatusCode, body, res.Header)
	}
}

// The total timeout cuts a stream that runs too long; the idle timeout cuts one that goes quiet.
func TestTotalAndIdleTimeouts(t *testing.T) {
	stream := func(pause time.Duration) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "text/event-stream")
			for i := 0; i < 20; i++ {
				io.WriteString(w, "data: tick\n\n")
				w.(http.Flusher).Flush()
				select {
				case <-time.After(pause):
				case <-r.Context().Done():
					return
				}
			}
		}
	}
	read := func(url string) (int, time.Duration) {
		begin := time.Now()
		res, err := http.Get(url)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		lines := 0
		scanner := bufio.NewScanner(res.Body)
		for scanner.Scan() {
			if strings.HasPrefix(scanner.Text(), "data:") {
				lines++
			}
		}
		return lines, time.Since(begin)
	}

	_, ticking := upstream(t, stream(20*time.Millisecond))
	_, total := gatewayWith(t, func(cfg *snapshot.Config) { cfg.Routes[0].TimeoutMs = 120 }, ticking)
	if lines, took := read(total.URL + "/events"); lines == 0 || lines >= 20 || took > 2*time.Second {
		t.Fatalf("total timeout: %d events in %s", lines, took)
	}

	_, quiet := upstream(t, stream(400*time.Millisecond))
	_, idle := gatewayWith(t, func(cfg *snapshot.Config) { cfg.Services[0].IdleTimeoutMs = 100 }, quiet)
	if lines, took := read(idle.URL + "/events"); lines != 1 || took > 2*time.Second {
		t.Fatalf("idle timeout: %d events in %s", lines, took)
	}
}

// A mirrored copy reaches the shadow stage with forwarding headers; the client
// only ever sees the primary's answer.
func TestMirrorCopiesWithoutAffectingTheClient(t *testing.T) {
	copies := make(chan *http.Request, 1)
	bodies := make(chan string, 1)
	_, primary := upstream(t, func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		io.WriteString(w, "primary:"+string(raw))
	})
	_, shadow := upstream(t, func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		bodies <- string(raw)
		copies <- r
		time.Sleep(300 * time.Millisecond)
		w.WriteHeader(http.StatusInternalServerError)
	})
	shadow.Stage = "SHADOW"
	_, front := gatewayWith(t, func(cfg *snapshot.Config) {
		cfg.Bindings = []snapshot.Binding{routeBinding("mirror", `{"stage":"SHADOW"}`)}
	}, primary, shadow)

	begin := time.Now()
	res, body := do(t, "POST", front.URL+"/v1/orders", map[string]string{"X-Forwarded-For": "198.51.100.1"}, strings.NewReader("hello"))
	if res.StatusCode != 200 || body != "primary:hello" || time.Since(begin) > 250*time.Millisecond {
		t.Fatalf("client saw %d %q after %s", res.StatusCode, body, time.Since(begin))
	}
	select {
	case copied := <-copies:
		if <-bodies != "hello" || copied.Header.Get("X-Forwarded-For") == "" || copied.Header.Get("X-Request-Id") == "" {
			t.Fatalf("mirror copy headers = %v", copied.Header)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("no mirrored copy")
	}
}
