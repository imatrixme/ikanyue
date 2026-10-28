// Package proxy is the data plane: it resolves a request's environment, matches
// it against that environment's snapshot, runs the API's plugin chain, picks a
// healthy instance of the environment's stage and streams the exchange. It never
// touches the database; the control plane swaps environments.
package proxy

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httputil"
	"net/netip"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"kanyue.gateway/internal/plugin"
	"kanyue.gateway/internal/policy"
	"kanyue.gateway/internal/snapshot"
)

// DefaultStage is Aliyun API Gateway's stage for requests without X-Ca-Stage.
const DefaultStage = policy.DefaultStage

const defaultHeaderTimeout = 30 * time.Second

var (
	errHeaderTimeout = errors.New("upstream response header timeout")
	errTotalTimeout  = errors.New("upstream exchange timeout")
	errIdleTimeout   = errors.New("upstream idle timeout")
)

// internalHeaders carry gateway-asserted identity; clients may never send them.
var internalHeaders = []string{"X-Kanyue-Consumer", "X-Kanyue-User"}

// Entry is one finished exchange, for request logs and metrics.
type Entry struct {
	Time time.Time
	Host string
	// Stage is the environment that served the request; Group and Route name its API group and API.
	Stage     string
	Group     string
	Route     string
	Operation string
	Service   string
	Instance  string
	Method    string
	Path      string
	Status    int
	Duration  time.Duration
	BytesIn   int64
	BytesOut  int64
	ClientIP  string
	Consumer  string
	TraceID   string
	// SpanID is the gateway's span; ParentSpanID is the caller's, when it sent a traceparent.
	SpanID       string
	ParentSpanID string
	RequestID    string
	Error        string
}

// Recorder receives finished exchanges; it must not block.
type Recorder interface {
	Record(Entry)
}

type Handler struct {
	table     atomic.Pointer[snapshot.Table]
	tableMu   sync.Mutex // serializes environment swaps
	endpoints atomic.Pointer[snapshot.Endpoints]
	trusted   []netip.Prefix
	proxy     *httputil.ReverseProxy
	logger    *slog.Logger
	recorder  Recorder
	env       *plugin.Env
	signals   sync.Map // kind \x00 key → time raised

	mirrorSlots   chan struct{}
	mirrorClient  *http.Client
	mirrorDropped atomic.Int64
	healthClient  *http.Client
}

// New builds a handler that trusts forwarding headers only from the given hops.
func New(trusted []netip.Prefix, logger *slog.Logger) *Handler {
	h := &Handler{trusted: trusted, logger: logger, mirrorSlots: make(chan struct{}, 32),
		mirrorClient: &http.Client{Transport: newTransport(), Timeout: 5 * time.Second},
		healthClient: &http.Client{Transport: newTransport(), Timeout: 2 * time.Second}}
	h.env = &plugin.Env{Limiter: plugin.NewMemoryLimiter(), Nonces: plugin.NewNonces(), Mirror: h.mirror, Signal: h.signal}
	h.proxy = &httputil.ReverseProxy{
		Rewrite:        h.rewrite,
		Transport:      &balancer{base: newTransport()},
		BufferPool:     bufferPool{},
		ModifyResponse: h.modifyResponse,
		ErrorHandler:   h.upstreamError,
	}
	return h
}

func newTransport() *http.Transport {
	return &http.Transport{
		DialContext:           (&net.Dialer{Timeout: 3 * time.Second, KeepAlive: 30 * time.Second}).DialContext,
		MaxIdleConns:          256,
		MaxIdleConnsPerHost:   64,
		IdleConnTimeout:       90 * time.Second,
		ExpectContinueTimeout: time.Second,
	}
}

// Env is shared by every snapshot this handler serves, so limits and nonces survive a publish.
func (h *Handler) Env() *plugin.Env                           { return h.env }
func (h *Handler) SetRecorder(recorder Recorder)              { h.recorder = recorder }
func (h *Handler) Table() *snapshot.Table                     { return h.table.Load() }
func (h *Handler) SetEndpoints(endpoints *snapshot.Endpoints) { h.endpoints.Store(endpoints) }
func (h *Handler) Endpoints() *snapshot.Endpoints             { return h.endpoints.Load() }
func (h *Handler) MirrorDropped() int64                       { return h.mirrorDropped.Load() }

// Prepare is the table that would serve with routes swapped in for its
// environment; it fails when a domain would be fixed to two environments.
func (h *Handler) Prepare(routes *snapshot.Routes) (*snapshot.Table, error) {
	return h.table.Load().With(routes)
}

// SetStage swaps one environment's routes; the others keep serving.
func (h *Handler) SetStage(routes *snapshot.Routes) error {
	h.tableMu.Lock()
	defer h.tableMu.Unlock()
	next, err := h.table.Load().With(routes)
	if err != nil {
		return err
	}
	h.table.Store(next)
	return nil
}

// Versions is each environment's served version; 0 before its first release.
func (h *Handler) Versions() map[string]int { return h.table.Load().Versions() }

// exchange is one request's state across the proxy callbacks.
type exchange struct {
	ctx         *plugin.Context
	stage       string
	target      *snapshot.Target
	endpoints   *snapshot.Endpoints
	peer        *snapshot.Peer
	traceparent string
	parentSpan  string
	start       time.Time
	writer      *recorder
	body        *countingBody
	timer       *time.Timer
	cancel      context.CancelCauseFunc
}

type exchangeKey struct{}

func exchangeOf(r *http.Request) *exchange { return r.Context().Value(exchangeKey{}).(*exchange) }

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	for _, key := range internalHeaders {
		r.Header.Del(key)
	}
	client, proto := h.client(r)
	ex := &exchange{start: time.Now(), writer: &recorder{ResponseWriter: w}, traceparent: traceparent(r.Header.Get("traceparent"))}
	if incoming := strings.Split(r.Header.Get("traceparent"), "-"); len(incoming) == 4 && strings.Contains(ex.traceparent, "-"+incoming[1]+"-") {
		ex.parentSpan = incoming[2] // the trace was continued
	}
	ex.ctx = &plugin.Context{Request: r, ClientIP: client, RequestID: requestID(r.Header.Get("X-Request-Id")),
		Proto: proto, Host: r.Host, Header: http.Header{}}
	if r.Body != nil && r.Body != http.NoBody {
		ex.body = &countingBody{ReadCloser: r.Body}
		r.Body = ex.body
	}
	defer h.finish(ex)

	table := h.table.Load()
	stage, ok := table.Stage(r.Host, r.Header.Get("X-Ca-Stage"))
	if !ok {
		h.reply(ex, plugin.Fail(http.StatusBadRequest, "环境不存在", "Invalid X-Ca-Stage"))
		return
	}
	ex.stage = stage
	target, ok := table.Routes(stage).Match(r)
	if !ok {
		h.reply(ex, plugin.Fail(http.StatusNotFound, "接口不存在", "No route matched"))
		return
	}
	ctx := ex.ctx
	ex.target = target
	ctx.Route, ctx.Operation = target.Route, target.Operation.Pattern()
	ctx.Idempotent = target.Operation.Idempotent || r.Method == http.MethodGet || r.Method == http.MethodHead || r.Method == http.MethodOptions
	// The environment's own instances serve it unless traffic-split picks another stage.
	ctx.Stage = stage
	if reply := target.Chain.Request(ctx); reply != nil {
		h.reply(ex, reply)
		return
	}

	ex.endpoints = h.endpoints.Load()
	if !ex.endpoints.Has(target.Service.ID, ctx.Stage) {
		h.reply(ex, plugin.Fail(http.StatusServiceUnavailable, "服务暂不可用", "No available instance for stage "+ctx.Stage))
		return
	}
	ex.peer, ok = ex.endpoints.Pick(target.Service, ctx.Stage, balanceKey(ctx, target.Service.HashBy), nil, time.Now())
	if !ok {
		h.reply(ex, plugin.Fail(http.StatusServiceUnavailable, "服务暂不可用", "No healthy instance for stage "+ctx.Stage))
		return
	}

	reqCtx, cancel := context.WithCancelCause(context.WithValue(r.Context(), exchangeKey{}, ex))
	defer cancel(nil)
	ex.cancel = cancel
	header := target.Timeouts.Header()
	if header <= 0 {
		header = defaultHeaderTimeout
	}
	ex.timer = time.AfterFunc(header, func() { cancel(errHeaderTimeout) })
	defer ex.timer.Stop()
	if total := target.Timeouts.Total(); total > 0 {
		totalTimer := time.AfterFunc(total, func() { cancel(errTotalTimeout) })
		defer totalTimer.Stop()
	}
	h.proxy.ServeHTTP(ex.writer, r.WithContext(reqCtx))
}

// rewrite always sets the forwarding headers: kanyue.server hides PocketBase's
// own API from any request that carries them.
func (h *Handler) rewrite(pr *httputil.ProxyRequest) {
	ex := exchangeOf(pr.In)
	pr.SetURL(ex.peer.URL)
	setForwarded(pr.Out.Header, ex.ctx, ex.traceparent)
}

func setForwarded(header http.Header, ctx *plugin.Context, traceparent string) {
	client := ctx.ClientIP.String()
	header.Set("X-Forwarded-For", client)
	header.Set("X-Real-IP", client)
	header.Set("X-Forwarded-Proto", ctx.Proto)
	header.Set("X-Forwarded-Host", ctx.Host)
	header.Set("X-Request-Id", ctx.RequestID)
	header.Set("traceparent", traceparent)
	for _, key := range internalHeaders {
		header.Del(key)
	}
	if ctx.Consumer != "" {
		header.Set("X-Kanyue-Consumer", ctx.Consumer)
	}
	if ctx.User != "" {
		header.Set("X-Kanyue-User", ctx.User)
	}
}

func (h *Handler) modifyResponse(res *http.Response) error {
	ex := exchangeOf(res.Request)
	ex.timer.Stop()
	ctx := ex.ctx
	ctx.Status, ctx.ResponseHeader = res.StatusCode, res.Header
	if res.StatusCode != http.StatusSwitchingProtocols {
		if reply := ex.target.Chain.Response(ctx); reply != nil {
			res.Body.Close()
			res.Header = http.Header{}
			body := reply.Render(res.Header)
			res.StatusCode, res.Status = reply.Status, ""
			res.Body, res.ContentLength = io.NopCloser(bytes.NewReader(body)), int64(len(body))
			res.Header.Set("Content-Length", strconv.Itoa(len(body)))
			ctx.Status = reply.Status
		} else if idle := ex.target.Timeouts.Idle(); idle > 0 {
			res.Body = newIdleBody(res.Body, idle, ex.cancel)
		}
	}
	decorate(res.Header, ctx)
	return nil
}

func decorate(header http.Header, ctx *plugin.Context) {
	for key, values := range ctx.Header {
		if key == "Vary" {
			header[key] = append(header[key], values...)
		} else {
			header[key] = values
		}
	}
	header.Set("X-Ca-Request-Id", ctx.RequestID)
}

func (h *Handler) reply(ex *exchange, reply *plugin.Reply) {
	decorate(ex.writer.Header(), ex.ctx)
	reply.Write(ex.writer)
}

func (h *Handler) upstreamError(w http.ResponseWriter, r *http.Request, err error) {
	ex := exchangeOf(r)
	ctx := ex.ctx
	ctx.Err = err
	cause := context.Cause(r.Context())
	timedOut := errors.Is(cause, errHeaderTimeout) || errors.Is(cause, errTotalTimeout)
	var tooLarge *http.MaxBytesError
	switch {
	case errors.As(err, &tooLarge):
		h.reply(ex, plugin.TooLarge)
		return
	case r.Context().Err() != nil && !timedOut:
		return // the client went away; nobody is left to answer
	}
	if reply := ex.target.Chain.Response(ctx); reply != nil {
		h.reply(ex, reply)
		return
	}
	if timedOut {
		h.logger.Warn("Upstream timed out", "upstream", ctx.Upstream, "path", r.URL.Path, "cause", cause.Error())
		h.reply(ex, plugin.Fail(http.StatusGatewayTimeout, "服务响应超时", "Upstream timeout"))
		return
	}
	h.logger.Warn("Upstream failed", "upstream", ctx.Upstream, "path", r.URL.Path, "error", err.Error())
	h.reply(ex, plugin.Fail(http.StatusBadGateway, "服务暂不可用", "Upstream unavailable"))
}

// finish runs the log phase and records the exchange, also when the copy was aborted.
func (h *Handler) finish(ex *exchange) {
	ctx := ex.ctx
	ctx.Duration = time.Since(ex.start)
	ctx.Status = ex.writer.status
	if ctx.Status == 0 {
		ctx.Status = 499 // the client left before an answer
	}
	if ex.target != nil {
		ex.target.Chain.Log(ctx)
	}
	if h.recorder == nil {
		return
	}
	entry := Entry{Time: ex.start, Host: hostOnly(ctx.Host), Stage: ex.stage, Operation: ctx.Operation, Instance: ctx.Upstream,
		Method: ctx.Request.Method, Path: ctx.Request.URL.Path, Status: ctx.Status, Duration: ctx.Duration,
		BytesOut: ex.writer.bytes, ClientIP: ctx.ClientIP.String(), Consumer: ctx.Consumer, RequestID: ctx.RequestID}
	if parts := strings.Split(ex.traceparent, "-"); len(parts) == 4 {
		entry.TraceID, entry.SpanID, entry.ParentSpanID = parts[1], parts[2], ex.parentSpan
	}
	if ex.body != nil {
		entry.BytesIn = ex.body.n
	}
	if ex.target != nil {
		entry.Group, entry.Route, entry.Service = ex.target.Group, ex.target.RouteName, ex.target.Service.Name
	}
	if ctx.Err != nil {
		entry.Error = ctx.Err.Error()
		if cause := context.Cause(ctx.Request.Context()); cause != nil {
			entry.Error = cause.Error()
		}
	} else if reason := ex.writer.Header().Get("X-Ca-Error-Message"); reason != "" && ctx.Status >= 400 {
		entry.Error = reason
	}
	h.recorder.Record(entry)
}

func hostOnly(host string) string {
	if h, _, err := net.SplitHostPort(host); err == nil {
		return h
	}
	return host
}

// balanceKey is the hash balancer's key for this request.
func balanceKey(ctx *plugin.Context, by string) string {
	switch {
	case by == "user":
		return ctx.User
	case by == "ip":
		return ctx.ClientIP.String()
	case strings.HasPrefix(by, "header:"):
		return ctx.Request.Header.Get(strings.TrimPrefix(by, "header:"))
	case strings.HasPrefix(by, "cookie:"):
		if cookie, err := ctx.Request.Cookie(strings.TrimPrefix(by, "cookie:")); err == nil {
			return cookie.Value
		}
	}
	return ""
}

// balancer sends the exchange to the picked peer, reports the outcome for
// passive health, and retries an idempotent request once on another peer
// after a connection failure or a 502/503/504.
type balancer struct {
	base http.RoundTripper
}

func (b *balancer) RoundTrip(req *http.Request) (*http.Response, error) {
	ex := exchangeOf(req)
	peer := ex.peer
	for attempt := 0; ; attempt++ {
		out := req
		if attempt > 0 {
			out = req.Clone(req.Context())
			if req.GetBody != nil {
				body, err := req.GetBody()
				if err != nil {
					return nil, err
				}
				out.Body = body
			}
			out.URL.Host = peer.URL.Host
		}
		ex.ctx.Upstream = peer.Address
		release := peer.Acquire()
		res, err := b.base.RoundTrip(out)
		upstreamFault := err != nil && (req.Context().Err() == nil || errors.Is(context.Cause(req.Context()), errHeaderTimeout))
		badGateway := res != nil && (res.StatusCode == 502 || res.StatusCode == 503 || res.StatusCode == 504)
		now := time.Now()
		ex.endpoints.Report(ex.target.Service, ex.ctx.Stage, peer, upstreamFault || badGateway, now)
		if attempt == 0 && (badGateway || (err != nil && req.Context().Err() == nil)) && replayable(req, ex.ctx) {
			if next, ok := ex.endpoints.Pick(ex.target.Service, ex.ctx.Stage, balanceKey(ex.ctx, ex.target.Service.HashBy), peer, now); ok {
				if res != nil {
					_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, 64<<10))
					res.Body.Close()
				}
				release()
				peer = next
				continue
			}
		}
		if err != nil {
			release()
			return nil, err
		}
		res.Body = &releasingBody{ReadCloser: res.Body, release: release}
		return res, nil
	}
}

func replayable(req *http.Request, ctx *plugin.Context) bool {
	return ctx.Idempotent && (req.Body == nil || req.Body == http.NoBody || req.GetBody != nil)
}

type releasingBody struct {
	io.ReadCloser
	release func()
}

func (b *releasingBody) Close() error {
	b.release()
	return b.ReadCloser.Close()
}

// Write lets an upgraded connection (WebSocket) pass through the wrapper.
func (b *releasingBody) Write(p []byte) (int, error) {
	if w, ok := b.ReadCloser.(io.Writer); ok {
		return w.Write(p)
	}
	return 0, errors.New("body is not writable")
}

// idleBody cancels the exchange when the upstream stays silent too long between reads.
type idleBody struct {
	io.ReadCloser
	timer *time.Timer
	idle  time.Duration
}

func newIdleBody(body io.ReadCloser, idle time.Duration, cancel context.CancelCauseFunc) *idleBody {
	return &idleBody{ReadCloser: body, idle: idle, timer: time.AfterFunc(idle, func() { cancel(errIdleTimeout) })}
}

func (b *idleBody) Read(p []byte) (int, error) {
	n, err := b.ReadCloser.Read(p)
	b.timer.Reset(b.idle)
	return n, err
}

func (b *idleBody) Close() error {
	b.timer.Stop()
	return b.ReadCloser.Close()
}

// recorder notes the status and size of what the client receives.
type recorder struct {
	http.ResponseWriter
	status int
	bytes  int64
}

func (r *recorder) WriteHeader(status int) {
	if r.status == 0 || r.status == http.StatusContinue {
		r.status = status
	}
	r.ResponseWriter.WriteHeader(status)
}

func (r *recorder) Write(p []byte) (int, error) {
	if r.status == 0 {
		r.status = http.StatusOK
	}
	n, err := r.ResponseWriter.Write(p)
	r.bytes += int64(n)
	return n, err
}

// Unwrap lets http.ResponseController reach Flush and Hijack.
func (r *recorder) Unwrap() http.ResponseWriter { return r.ResponseWriter }

type countingBody struct {
	io.ReadCloser
	n int64
}

func (b *countingBody) Read(p []byte) (int, error) {
	n, err := b.ReadCloser.Read(p)
	b.n += int64(n)
	return n, err
}

// mirror sends a copy without waiting; when 32 copies are in flight, more are dropped and counted.
func (h *Handler) mirror(ctx *plugin.Context, serviceID, stage string, r *http.Request) {
	var service *snapshot.Service
	for _, candidate := range h.table.Load().Services() {
		if candidate.ID == serviceID {
			service = candidate
		}
	}
	endpoints := h.endpoints.Load()
	if service == nil {
		return
	}
	peer, ok := endpoints.Pick(service, stage, "", nil, time.Now())
	if !ok {
		return
	}
	select {
	case h.mirrorSlots <- struct{}{}:
	default:
		h.mirrorDropped.Add(1)
		return
	}
	setForwarded(r.Header, ctx, traceparent(""))
	r.URL.Scheme, r.URL.Host, r.Host, r.RequestURI = "http", peer.URL.Host, "", ""
	go func() {
		defer func() { <-h.mirrorSlots }()
		release := peer.Acquire()
		defer release()
		res, err := h.mirrorClient.Do(r)
		if err != nil {
			return
		}
		_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, 1<<20))
		res.Body.Close()
	}()
}

// Signal is a condition plugins raised, such as an open breaker.
type Signal struct {
	Kind  string
	Key   string
	Since time.Time
}

func (h *Handler) signal(kind, key string, active bool) {
	if active {
		h.signals.LoadOrStore(kind+"\x00"+key, time.Now())
		h.logger.Warn("Signal raised", "kind", kind, "key", key)
	} else if _, was := h.signals.LoadAndDelete(kind + "\x00" + key); was {
		h.logger.Info("Signal cleared", "kind", kind, "key", key)
	}
}

// Signals lists the active signals.
func (h *Handler) Signals() []Signal {
	var out []Signal
	h.signals.Range(func(key, value any) bool {
		kind, name, _ := strings.Cut(key.(string), "\x00")
		out = append(out, Signal{Kind: kind, Key: name, Since: value.(time.Time)})
		return true
	})
	return out
}

// CheckHealth runs the active checks that are due, in parallel, and waits for them.
func (h *Handler) CheckHealth(ctx context.Context, now time.Time) {
	endpoints := h.endpoints.Load()
	var wg sync.WaitGroup
	for _, service := range h.table.Load().Services() {
		for _, peer := range endpoints.Due(service, now) {
			wg.Add(1)
			go func() {
				defer wg.Done()
				passed := h.probe(ctx, peer.URL.Host, service.Health.Path)
				if peer.Checked(passed, service.Health.Threshold) {
					h.logger.Warn("Instance health changed", "service", service.Name, "address", peer.Address, "healthy", passed)
				}
			}()
		}
	}
	wg.Wait()
}

func (h *Handler) probe(ctx context.Context, host, path string) bool {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://"+host+path, nil)
	if err != nil {
		return false
	}
	req.Header.Set("User-Agent", "kanyue.gateway health check")
	res, err := h.healthClient.Do(req)
	if err != nil {
		return false
	}
	_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, 64<<10))
	res.Body.Close()
	return res.StatusCode < 400
}

// client resolves the caller's address and scheme, believing forwarding headers
// only from trusted hops and reading X-Forwarded-For from the right.
func (h *Handler) client(r *http.Request) (netip.Addr, string) {
	proto := "http"
	if r.TLS != nil {
		proto = "https"
	}
	addrPort, err := netip.ParseAddrPort(r.RemoteAddr)
	if err != nil {
		return netip.Addr{}, proto
	}
	addr := addrPort.Addr().Unmap()
	if !h.isTrusted(addr) {
		return addr, proto
	}
	if forwarded := r.Header.Get("X-Forwarded-Proto"); forwarded == "http" || forwarded == "https" {
		proto = forwarded
	}
	hops := strings.Split(strings.Join(r.Header.Values("X-Forwarded-For"), ","), ",")
	for i := len(hops) - 1; i >= 0; i-- {
		hop, err := netip.ParseAddr(strings.TrimSpace(hops[i]))
		if err != nil {
			break
		}
		addr = hop.Unmap()
		if !h.isTrusted(addr) {
			break
		}
	}
	return addr, proto
}

func (h *Handler) isTrusted(addr netip.Addr) bool {
	for _, prefix := range h.trusted {
		if prefix.Contains(addr) {
			return true
		}
	}
	return false
}

// requestID keeps a well-formed incoming id so callers can correlate, and mints one otherwise.
func requestID(incoming string) string {
	if len(incoming) > 0 && len(incoming) <= 64 && strings.Trim(incoming,
		"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.") == "" {
		return incoming
	}
	return randomHex(16)
}

// traceparent continues a valid W3C trace with a new span, or starts one.
func traceparent(incoming string) string {
	parts := strings.Split(incoming, "-")
	if len(parts) == 4 && parts[0] == "00" && isHex(parts[1], 32) && parts[1] != strings.Repeat("0", 32) &&
		isHex(parts[2], 16) && isHex(parts[3], 2) {
		return "00-" + parts[1] + "-" + randomHex(8) + "-" + parts[3]
	}
	return "00-" + randomHex(16) + "-" + randomHex(8) + "-01"
}

func isHex(value string, length int) bool {
	if len(value) != length {
		return false
	}
	_, err := hex.DecodeString(value)
	return err == nil && strings.ToLower(value) == value
}

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

var buffers = sync.Pool{New: func() any { b := make([]byte, 32*1024); return &b }}

type bufferPool struct{}

func (bufferPool) Get() []byte  { return *buffers.Get().(*[]byte) }
func (bufferPool) Put(b []byte) { buffers.Put(&b) }
