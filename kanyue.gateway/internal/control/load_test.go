//go:build load

package control

import (
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"kanyue.gateway/internal/policy"
	"kanyue.gateway/internal/schema"
	"kanyue.gateway/internal/telemetry"
)

// Load check against the design.md targets (G3 5.1), on this machine:
//
//	GOMAXPROCS=1 go test -tags load -run TestLoad -v ./internal/control/
//
// The upstream runs in its own process so it does not share the gateway's
// single P; ab (ApacheBench, keep-alive) drives load from outside. The chain
// is the release default: request-id, jwt-auth, rate-limit and request logging.
// ab reports whole milliseconds, so the added P99 is coarse.

const loadUpstreamEnv = "KANYUE_GATEWAY_LOAD_UPSTREAM"

var loadBody = strings.Repeat("x", 1024)

// TestLoadUpstream is the upstream process; it only runs when spawned by TestLoad.
func TestLoadUpstream(t *testing.T) {
	addr := os.Getenv(loadUpstreamEnv)
	if addr == "" {
		t.Skip("spawned by TestLoad")
	}
	http.ListenAndServe(addr, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == defaultManifest {
			io.WriteString(w, manifestV1)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, loadBody)
	}))
}

func freeAddress(t *testing.T) string {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	return listener.Addr().String()
}

type abResult struct {
	rps      string
	p50, p99 string
	failed   string
}

func runAB(t *testing.T, url, token string) abResult {
	t.Helper()
	out, err := exec.Command("ab", "-k", "-q", "-c", "32", "-n", "60000", "-H", "token: "+token, url).CombinedOutput()
	if err != nil {
		t.Fatalf("ab: %v\n%s", err, out)
	}
	find := func(pattern string) string {
		match := regexp.MustCompile(pattern).FindSubmatch(out)
		if match == nil {
			t.Fatalf("ab output lacks %q:\n%s", pattern, out)
		}
		return string(match[1])
	}
	return abResult{rps: find(`Requests per second:\s+([\d.]+)`), p50: find(`\n\s+50%\s+(\d+)`), p99: find(`\n\s+99%\s+(\d+)`),
		failed: find(`Failed requests:\s+(\d+)`)}
}

func TestLoad(t *testing.T) {
	if _, err := exec.LookPath("ab"); err != nil {
		t.Skip("needs ab (ApacheBench)")
	}
	upstreamAddr := freeAddress(t)
	upstream := exec.Command(os.Args[0], "-test.run=^TestLoadUpstream$")
	upstream.Env = append(os.Environ(), loadUpstreamEnv+"="+upstreamAddr)
	if err := upstream.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { upstream.Process.Kill(); upstream.Wait() })
	waitFor(t, func() bool {
		res, err := http.Get("http://" + upstreamAddr + "/ready")
		if err == nil {
			res.Body.Close()
		}
		return err == nil
	})

	c, app := newControl(t)
	tel, err := telemetry.Open(telemetry.Options{Path: filepath.Join(t.TempDir(), telemetryFile), Sample: 0.1,
		Slow: time.Second, LogRetention: time.Hour, MetricRetention: time.Hour})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { tel.Close() })
	c.useTelemetry(tel)
	if err := c.Heartbeat(Beat{Service: "kanyue.server", Address: upstreamAddr, Stage: "RELEASE", ManifestHash: "h1"}); err != nil {
		t.Fatal(err)
	}
	waitFor(t, func() bool { return len(statuses(t, app)) == 3 })
	if err := c.rebuildEndpoints(); err != nil {
		t.Fatal(err)
	}
	service, err := app.FindFirstRecordByData(schema.Services, "name", "kanyue.server")
	if err != nil {
		t.Fatal(err)
	}
	secret := strings.Repeat("j", 40)
	create(t, app, schema.Secrets, map[string]any{"name": "jwt", "value": secret})
	baseline, err := app.FindFirstRecordByData(schema.PolicySets, "name", schema.Baseline)
	if err != nil {
		t.Fatal(err)
	}
	baseline.Set("items", []policy.Item{item("jwt-auth", `{"secret":"jwt"}`),
		item("rate-limit", `{"limit":100000000,"window":"second","by":"api"}`)})
	if err := app.Save(baseline); err != nil {
		t.Fatal(err)
	}
	group, drafted := draftGroup(t, app, "mapi", []string{"*"}, service.Id)
	for _, api := range drafted {
		api.Set("auth", "jwt")
		if err := app.Save(api); err != nil {
			t.Fatal(err)
		}
	}
	release(t, c, "RELEASE", targetsOf(group, all(drafted)...))
	gateway := httptest.NewServer(c.handler)
	defer gateway.Close()

	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"id": "s1", "role": "student",
		"exp": time.Now().Add(time.Hour).Unix()}).SignedString([]byte(secret))
	if err != nil {
		t.Fatal(err)
	}
	path := "/v1/public/course-catalog"
	if res, err := http.Get(gateway.URL + path); err != nil || res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("jwt-auth is not in the chain: %v %v", res, err)
	}

	runAB(t, gateway.URL+path, token) // warm up
	direct := runAB(t, "http://"+upstreamAddr+path, token)
	through := runAB(t, gateway.URL+path, token)
	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)
	tel.Flush(time.Now().Add(time.Minute))
	t.Logf("GOMAXPROCS=%d, 32 keep-alive connections, 60000 requests, 1 KB responses", runtime.GOMAXPROCS(0))
	t.Logf("direct upstream: %s req/s, p50 %s ms, p99 %s ms, failed %s", direct.rps, direct.p50, direct.p99, direct.failed)
	t.Logf("through gateway: %s req/s, p50 %s ms, p99 %s ms, failed %s", through.rps, through.p50, through.p99, through.failed)
	t.Logf("gateway process (includes the test PocketBase): heap in use %d MB, from OS %d MB, logs dropped %d",
		mem.HeapInuse>>20, mem.Sys>>20, tel.Dropped())
	if through.failed != "0" {
		t.Fatal(fmt.Sprintf("%s requests failed through the gateway", through.failed))
	}
}
