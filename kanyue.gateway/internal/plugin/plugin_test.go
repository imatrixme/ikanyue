package plugin

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Test-only secret, never used outside this file.
var jwtSecret = strings.Repeat("test-only-jwt-key-", 2)

var start = time.Date(2026, 10, 28, 9, 0, 0, 0, time.UTC)

// clock is a settable now for plugins built in a test.
type clock struct{ now time.Time }

func (c *clock) Now() time.Time { return c.now }

func testEnv(c *clock) *Env {
	return &Env{
		Secret: func(name string) (string, error) {
			if name == "jwt" {
				return jwtSecret, nil
			}
			return "", fmt.Errorf("unknown secret %q", name)
		},
		Consumers: map[string]Consumer{"app-key-1": {ID: "c1", Name: "partner", AppKey: "app-key-1", Secret: "partner-secret"},
			"app-key-2": {ID: "c2", Name: "other", AppKey: "app-key-2", Secret: "other-secret"}},
		Limiter: NewMemoryLimiter(), Nonces: NewNonces(), Now: c.Now,
		Services: map[string]string{"kanyue.pay": "svc-pay"},
		Mirror:   func(*Context, string, string, *http.Request) {},
	}
}

func chain(t *testing.T, env *Env, bindings ...Binding) *Chain {
	t.Helper()
	c, err := NewChain(bindings, nil, Scope{Env: env, Route: "r1", RouteName: "route", Service: "svc"})
	if err != nil {
		t.Fatal(err)
	}
	return c
}

func bind(name, config string) Binding { return Binding{Plugin: name, Config: json.RawMessage(config)} }

func request(method, target string, header map[string]string) *Context {
	r := httptest.NewRequest(method, target, nil)
	for key, value := range header {
		r.Header.Set(key, value)
	}
	return &Context{Request: r, ClientIP: netip.MustParseAddr("203.0.113.9"), RequestID: "rid", Stage: "RELEASE",
		Route: "r1", Operation: method + " /v1/x", Header: http.Header{}}
}

// Every schema parses, and configurations are checked against it before they are decoded.
func TestSchemasRejectInvalidConfigurations(t *testing.T) {
	env := testEnv(&clock{start})
	for _, p := range All() {
		var schema map[string]any
		if err := json.Unmarshal(p.Schema(), &schema); err != nil || schema["type"] != "object" {
			t.Errorf("%s: schema is not an object schema", p.Name())
		}
	}
	for _, item := range []struct{ plugin, config, want string }{
		{"rate-limit", `{"limit":10}`, "window is required"},
		{"rate-limit", `{"limit":1.5,"window":"minute"}`, "whole number"},
		{"rate-limit", `{"limit":1,"window":"week"}`, "must be one of"},
		{"cors", `{"allowOrigins":["*"],"extra":1}`, "unknown field extra"},
		{"ip-restriction", `{"deny":["not-an-ip"]}`, "not an IP"},
		{"jwt-auth", `{"secret":"missing"}`, "unknown secret"},
		{"traffic-split", `{"rules":[{"stage":"canary","percent":10}]}`, "must match"},
		{"traffic-split", `{"rules":[{"stage":"CANARY"}]}`, "needs a header or cookie value, or a percent"},
		{"mirror", `{"service":"nowhere"}`, "unknown service"},
		{"request-rewrite", `{"path":{"match":"(","replace":""}}`, "path.match"},
	} {
		_, err := NewChain([]Binding{bind(item.plugin, item.config)}, nil, Scope{Env: env})
		if err == nil || !strings.Contains(err.Error(), item.want) {
			t.Errorf("%s %s: error %v, want %q", item.plugin, item.config, err, item.want)
		}
	}
	if _, err := NewChain([]Binding{{Plugin: "nope"}}, nil, Scope{Env: env}); err == nil {
		t.Error("unknown plugin accepted")
	}
}

// Lower levels override higher ones by plugin name, a disabled binding removes an
// inherited plugin, priorities order the chain, and consumer bindings apply to that consumer only.
func TestBindingsMergeAndOrder(t *testing.T) {
	global := []Binding{bind("maintenance", `{}`), bind("rate-limit", `{"limit":100,"window":"minute"}`), bind("cors", `{"allowOrigins":["*"]}`)}
	site := []Binding{{Plugin: "maintenance", Disabled: true}}
	route := []Binding{bind("rate-limit", `{"limit":1,"window":"minute","by":"consumer"}`), bind("aliyun-signature", `{}`)}
	merged := Merge(global, site, route)
	if len(merged) != 3 || merged[0].Plugin != "rate-limit" || !strings.Contains(string(merged[0].Config), `"limit":1`) {
		t.Fatalf("merged = %+v", merged)
	}
	env := testEnv(&clock{start})
	c, err := NewChain(merged, map[string][]Binding{"partner": {bind("rate-limit", `{"limit":3,"window":"minute","by":"consumer"}`)}},
		Scope{Env: env, Route: "r1"})
	if err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(c.Names(), ","); got != "cors,aliyun-signature,rate-limit" {
		t.Fatalf("order = %s", got)
	}
	for i := range 4 {
		ctx := request("GET", "/v1/x", nil)
		ctx.Consumer = "partner"
		reply := c.slots[2].instance(ctx).Request(ctx)
		if (i < 3) != (reply == nil) {
			t.Fatalf("partner request %d: %+v", i, reply)
		}
	}
	ctx := request("GET", "/v1/x", nil)
	ctx.Consumer = "other"
	if c.slots[2].instance(ctx).Request(ctx) != nil {
		t.Fatal("first request of another consumer limited")
	}
	if c.slots[2].instance(ctx).Request(ctx) == nil {
		t.Fatal("route limit of 1 not applied to other consumers")
	}
}

func token(t *testing.T, secret string, claims jwt.MapClaims) string {
	t.Helper()
	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
	if err != nil {
		t.Fatal(err)
	}
	return signed
}

// jwt-auth accepts what kanyue.server accepts and answers like it, so the mini program drops a dead session.
func TestJWTAuthMatchesServerRules(t *testing.T) {
	c := &clock{start}
	session := chain(t, testEnv(c), bind("jwt-auth", `{"secret":"jwt"}`))
	ops := chain(t, testEnv(c), bind("jwt-auth", `{"secret":"jwt","scope":"ops","roles":["teacher"]}`))
	exp := start.Add(time.Hour).Unix()
	valid := token(t, jwtSecret, jwt.MapClaims{"id": "s1", "role": "student", "exp": exp})

	for _, header := range []map[string]string{{"token": valid}, {"jwtoken": valid}, {"Authorization": "Bearer " + valid}} {
		ctx := request("GET", "/v1/x", header)
		if reply := session.Request(ctx); reply != nil || ctx.User != "s1" {
			t.Fatalf("valid token via %v: %+v user=%q", header, reply, ctx.User)
		}
	}
	for name, header := range map[string]map[string]string{
		"missing":   nil,
		"expired":   {"token": token(t, jwtSecret, jwt.MapClaims{"id": "s1", "exp": start.Add(-time.Minute).Unix()})},
		"foreign":   {"token": token(t, "another-secret-that-is-at-least-32-chars", jwt.MapClaims{"id": "s1", "exp": exp})},
		"challenge": {"token": token(t, jwtSecret, jwt.MapClaims{"id": "s1", "challengeType": "bind", "exp": exp})},
		"garbage":   {"token": "x.y.z"},
	} {
		reply := session.Request(request("GET", "/v1/x", header))
		if reply == nil || reply.Status != 401 || reply.ErrorCode != "AUTH_SESSION_INVALID" {
			t.Errorf("%s token: %+v", name, reply)
		}
	}
	if reply := ops.Request(request("GET", "/ops/x", map[string]string{"token": valid})); reply == nil || reply.Status != 401 {
		t.Errorf("app token passed the ops scope: %+v", reply)
	}
	student := token(t, jwtSecret, jwt.MapClaims{"id": "s1", "role": "student", "scope": "ops", "exp": exp})
	if reply := ops.Request(request("GET", "/ops/x", map[string]string{"token": student})); reply == nil || reply.Status != 403 {
		t.Errorf("student passed the teacher role: %+v", reply)
	}
	teacher := token(t, jwtSecret, jwt.MapClaims{"id": "t1", "role": "teacher", "scope": "ops", "exp": exp})
	if reply := ops.Request(request("GET", "/ops/x", map[string]string{"token": teacher})); reply != nil {
		t.Errorf("ops token rejected: %+v", reply)
	}
}

func sign(secret, toSign string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(toSign))
	return base64.StdEncoding.EncodeToString(mac.Sum(nil))
}

// The string to sign follows Aliyun's documented layout; signed requests are
// checked for AppKey, signature, timestamp window and nonce reuse.
func TestAliyunSignatureAndReplayGuard(t *testing.T) {
	c := &clock{start}
	stamp := fmt.Sprint(start.UnixMilli())
	signed := func(secret, nonce, timestamp string) *Context {
		r := httptest.NewRequest("POST", "/v1/x?b=2&a=1&c=", strings.NewReader("d=4"))
		r.Header.Set("Accept", "application/json")
		r.Header.Set("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
		r.Header.Set("X-Ca-Key", "app-key-1")
		r.Header.Set("X-Ca-Timestamp", timestamp)
		r.Header.Set("X-Ca-Nonce", nonce)
		r.Header.Set("X-Ca-Signature-Headers", "X-Ca-Timestamp,X-Ca-Key,X-Ca-Nonce")
		toSign := "POST\napplication/json\n\napplication/x-www-form-urlencoded; charset=UTF-8\n\n" +
			"X-Ca-Key:app-key-1\nX-Ca-Nonce:" + nonce + "\nX-Ca-Timestamp:" + timestamp + "\n/v1/x?a=1&b=2&c&d=4"
		r.Header.Set("X-Ca-Signature", sign(secret, toSign))
		return &Context{Request: r, Header: http.Header{}}
	}
	guarded := chain(t, testEnv(c), bind("aliyun-signature", `{}`), bind("replay-guard", `{}`))

	ctx := signed("partner-secret", "n1", stamp)
	if reply := guarded.Request(ctx); reply != nil || ctx.Consumer != "partner" || !ctx.Signed {
		t.Fatalf("valid signature: %+v consumer=%q", reply, ctx.Consumer)
	}
	if body := make([]byte, 3); func() bool { n, _ := ctx.Request.Body.Read(body); return string(body[:n]) != "d=4" }() {
		t.Fatal("form body not restored for the upstream")
	}
	for name, item := range map[string]struct {
		ctx    *Context
		reason string
	}{
		"replayed nonce": {signed("partner-secret", "n1", stamp), "Nonce Used"},
		"old timestamp":  {signed("partner-secret", "n2", fmt.Sprint(start.Add(-16*time.Minute).UnixMilli())), "Invalid Timestamp"},
		"wrong secret":   {signed("guess", "n3", stamp), "Invalid Signature, Server StringToSign:`POST#application/json##"},
	} {
		reply := guarded.Request(item.ctx)
		if reply == nil || reply.Status != 400 || !strings.HasPrefix(reply.Reason, item.reason) {
			t.Errorf("%s: %+v", name, reply)
		}
	}
	unknown := signed("partner-secret", "n4", stamp)
	unknown.Request.Header.Set("X-Ca-Key", "nobody")
	if reply := guarded.Request(unknown); reply == nil || reply.Reason != "Invalid AppKey" {
		t.Errorf("unknown key: %+v", reply)
	}
	onlyOther := chain(t, testEnv(c), bind("aliyun-signature", `{"consumers":["other"]}`))
	if reply := onlyOther.Request(signed("partner-secret", "n5", stamp)); reply == nil || reply.Status != 403 {
		t.Errorf("unauthorized consumer: %+v", reply)
	}
	// Unsigned mini program traffic on a route without signature auth passes untouched by replay-guard.
	plain := chain(t, testEnv(c), bind("replay-guard", `{}`))
	if reply := plain.Request(request("GET", "/v1/x", map[string]string{"X-Ca-Nonce": "1730000000000", "X-Ca-Stage": "RELEASE"})); reply != nil {
		t.Errorf("unsigned request rejected: %+v", reply)
	}
}

// Quotas count per route and key within a window; daily windows reset at China midnight.
func TestRateLimitWindows(t *testing.T) {
	c := &clock{start}
	limited := chain(t, testEnv(c), bind("rate-limit", `{"limit":2,"window":"minute","by":"ip"}`))
	for i := range 3 {
		reply := limited.Request(request("GET", "/v1/x", nil))
		if (i < 2) != (reply == nil) {
			t.Fatalf("request %d: %+v", i, reply)
		}
		if reply != nil && (reply.Status != 429 || reply.Reason != "Throttled by IP Flow Control") {
			t.Fatalf("reply = %+v", reply)
		}
	}
	other := request("GET", "/v1/x", nil)
	other.ClientIP = netip.MustParseAddr("198.51.100.1")
	if limited.Request(other) != nil {
		t.Fatal("another IP shared the quota")
	}
	c.now = start.Add(time.Minute)
	if limited.Request(request("GET", "/v1/x", nil)) != nil {
		t.Fatal("quota not reset in the next window")
	}

	limiter := NewMemoryLimiter()
	beforeMidnight := time.Date(2026, 10, 28, 15, 59, 0, 0, time.UTC) // 23:59 in China
	if !limiter.Allow("k", 1, 24*time.Hour, beforeMidnight) || limiter.Allow("k", 1, 24*time.Hour, beforeMidnight.Add(30*time.Second)) {
		t.Fatal("daily quota not enforced")
	}
	if !limiter.Allow("k", 1, 24*time.Hour, beforeMidnight.Add(time.Minute)) {
		t.Fatal("daily quota did not reset at China midnight")
	}
	byConsumer := chain(t, testEnv(c), bind("rate-limit", `{"limit":1,"window":"second","by":"consumer"}`))
	for range 3 {
		if byConsumer.Request(request("GET", "/v1/x", nil)) != nil {
			t.Fatal("request without a consumer counted")
		}
	}
}

// The breaker opens on the error ratio, answers with the fallback while open,
// lets one probe through after the pause and closes when it succeeds.
func TestCircuitBreakerWithFallback(t *testing.T) {
	c := &clock{start}
	env := testEnv(c)
	var signals []string
	env.Signal = func(kind, key string, active bool) { signals = append(signals, fmt.Sprint(kind, key, active)) }
	guarded := chain(t, env, bind("circuit-breaker", `{"minRequests":4,"errorRatio":0.5,"openSeconds":30}`),
		bind("fallback", `{"status":200,"body":"{\"code\":10000,\"data\":[]}"}`))
	exchange := func(status int) *Reply {
		ctx := request("GET", "/v1/x", nil)
		if reply := guarded.Request(ctx); reply != nil {
			return reply
		}
		ctx.Upstream, ctx.Status = "10.0.0.1:80", status
		reply := guarded.Response(ctx)
		guarded.Log(ctx)
		return reply
	}
	for _, status := range []int{200, 500, 200} {
		exchange(status)
	}
	if reply := exchange(502); reply == nil || string(reply.Body) != `{"code":10000,"data":[]}` {
		t.Fatalf("5xx not replaced by the fallback: %+v", reply)
	}
	if reply := exchange(200); reply == nil || reply.Status != 200 || reply.Reason != "Fallback" {
		t.Fatalf("open breaker did not answer with the fallback: %+v", reply)
	}
	c.now = start.Add(31 * time.Second)
	probe := request("GET", "/v1/x", nil)
	if guarded.Request(probe) != nil {
		t.Fatal("probe not let through")
	}
	if guarded.Request(request("GET", "/v1/x", nil)) == nil {
		t.Fatal("a second request passed during the probe")
	}
	probe.Upstream, probe.Status = "10.0.0.1:80", 200
	guarded.Log(probe)
	if exchange(200) != nil {
		t.Fatal("breaker did not close after a good probe")
	}
	if got := strings.Join(signals, ","); got != "breakerroutetrue,breakerroutefalse" {
		t.Fatalf("signals = %s", got)
	}
	bare := chain(t, testEnv(c), bind("circuit-breaker", `{"minRequests":1}`))
	failed := request("GET", "/v1/x", nil)
	failed.Upstream, failed.Status = "10.0.0.1:80", 503
	bare.Log(failed)
	if reply := bare.Request(request("GET", "/v1/x", nil)); reply == nil || reply.Status != 503 || reply.Reason != "Circuit breaker open" {
		t.Fatalf("open breaker without fallback: %+v", reply)
	}
}

// Header rules match exactly; percentage rules keep one user on one side and split close to the ratio.
func TestTrafficSplit(t *testing.T) {
	split := chain(t, testEnv(&clock{start}), bind("traffic-split",
		`{"rules":[{"stage":"PRE","header":"X-Canary","value":"1"},{"stage":"CANARY","percent":10,"hashBy":"user"}]}`))
	ctx := request("GET", "/v1/x", map[string]string{"X-Canary": "1"})
	split.Request(ctx)
	if ctx.Stage != "PRE" {
		t.Fatalf("header rule stage = %s", ctx.Stage)
	}
	canary := 0
	for i := range 2000 {
		first, again := request("GET", "/v1/x", nil), request("GET", "/v1/x", nil)
		first.User, again.User = fmt.Sprint("user-", i), fmt.Sprint("user-", i)
		split.Request(first)
		split.Request(again)
		if first.Stage != again.Stage {
			t.Fatalf("user-%d switched stages", i)
		}
		if first.Stage == "CANARY" {
			canary++
		}
	}
	if canary < 140 || canary > 260 {
		t.Fatalf("canary share = %d of 2000", canary)
	}
}

// Access plugins: IP rules, maintenance with an allow list, CORS preflight, mock, body limits and rewrites.
func TestAccessPlugins(t *testing.T) {
	env := testEnv(&clock{start})
	if reply := chain(t, env, bind("ip-restriction", `{"deny":["203.0.113.0/24"]}`)).Request(request("GET", "/", nil)); reply == nil ||
		reply.Status != 403 || reply.Reason != "Access Denied By IP Control" {
		t.Errorf("deny list: %+v", reply)
	}
	if reply := chain(t, env, bind("ip-restriction", `{"allow":["10.0.0.0/8"]}`)).Request(request("GET", "/", nil)); reply == nil {
		t.Error("allow list admitted an outsider")
	}
	if reply := chain(t, env, bind("maintenance", `{"allowIPs":["203.0.113.9"]}`)).Request(request("GET", "/", nil)); reply != nil {
		t.Error("maintenance blocked an allowed IP")
	}
	if reply := chain(t, env, bind("maintenance", `{}`)).Request(request("GET", "/", nil)); reply == nil || reply.Status != 503 {
		t.Errorf("maintenance: %+v", reply)
	}

	cors := chain(t, env, bind("cors", `{"allowOrigins":["https://www.ikanyue.com"],"allowCredentials":true,"maxAge":600}`))
	preflight := request("OPTIONS", "/v1/x", map[string]string{"Origin": "https://www.ikanyue.com",
		"Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "token"})
	reply := cors.Request(preflight)
	if reply == nil || reply.Status != 204 || reply.Header.Get("Access-Control-Allow-Headers") != "token" ||
		preflight.Header.Get("Access-Control-Allow-Origin") != "https://www.ikanyue.com" || reply.Header.Get("Access-Control-Max-Age") != "600" {
		t.Errorf("preflight: %+v %v", reply, preflight.Header)
	}
	stranger := request("GET", "/v1/x", map[string]string{"Origin": "https://evil.example"})
	if cors.Request(stranger) != nil || stranger.Header.Get("Access-Control-Allow-Origin") != "" {
		t.Error("CORS granted to an unknown origin")
	}

	if reply := chain(t, env, bind("mock", `{"body":"{\"ok\":true}"}`)).Request(request("GET", "/", nil)); reply == nil ||
		reply.Status != 200 || string(reply.Body) != `{"ok":true}` {
		t.Errorf("mock: %+v", reply)
	}
	big := request("POST", "/", nil)
	big.Request.ContentLength = 2048
	if reply := chain(t, env, bind("body-limit", `{"maxBytes":1024}`)).Request(big); reply == nil || reply.Status != 413 {
		t.Errorf("body limit: %+v", reply)
	}

	rewrite := chain(t, env, bind("request-rewrite", `{"setHeaders":{"X-Ca-Client-Ip":"{clientIp}","X-From":"gw-{stage}"},
		"removeHeaders":["X-Debug"],"setQuery":{"source":"gateway"},"removeQuery":["sign"],
		"path":{"match":"^/legacy/(.*)$","replace":"/v1/$1"},"responseSetHeaders":{"X-Served-By":"{requestId}"}}`))
	ctx := request("GET", "/legacy/orders?sign=x&page=2", map[string]string{"X-Debug": "1"})
	rewrite.Request(ctx)
	r := ctx.Request
	if r.URL.Path != "/v1/orders" || r.URL.Query().Get("sign") != "" || r.URL.Query().Get("source") != "gateway" ||
		r.URL.Query().Get("page") != "2" || r.Header.Get("X-Ca-Client-Ip") != "203.0.113.9" || r.Header.Get("X-From") != "gw-RELEASE" ||
		r.Header.Get("X-Debug") != "" {
		t.Errorf("rewritten request: %s %v", r.URL, r.Header)
	}
	ctx.ResponseHeader = http.Header{}
	rewrite.Response(ctx)
	if ctx.ResponseHeader.Get("X-Served-By") != "rid" {
		t.Errorf("response header: %v", ctx.ResponseHeader)
	}
}
