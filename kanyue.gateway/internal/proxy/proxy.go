// Package proxy is the data plane: it matches a request against the current
// route snapshot, picks an instance for the request's stage and streams the
// exchange. It never touches the database; the control plane swaps snapshots.
package proxy

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"net/http/httputil"
	"net/netip"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"kanyue.gateway/internal/snapshot"
)

// DefaultStage is Aliyun API Gateway's stage for requests without X-Ca-Stage.
const DefaultStage = "RELEASE"

const defaultHeaderTimeout = 30 * time.Second

var errHeaderTimeout = errors.New("upstream response header timeout")

type Handler struct {
	routes    atomic.Pointer[snapshot.Routes]
	endpoints atomic.Pointer[snapshot.Endpoints]
	trusted   []netip.Prefix
	proxy     *httputil.ReverseProxy
	logger    *slog.Logger
}

// New builds a handler that trusts forwarding headers only from the given hops.
func New(trusted []netip.Prefix, logger *slog.Logger) *Handler {
	h := &Handler{trusted: trusted, logger: logger}
	h.proxy = &httputil.ReverseProxy{
		Rewrite:        rewrite,
		Transport:      newTransport(),
		BufferPool:     bufferPool{},
		ModifyResponse: stopHeaderTimer,
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

func (h *Handler) SetRoutes(routes *snapshot.Routes)          { h.routes.Store(routes) }
func (h *Handler) SetEndpoints(endpoints *snapshot.Endpoints) { h.endpoints.Store(endpoints) }
func (h *Handler) Endpoints() *snapshot.Endpoints             { return h.endpoints.Load() }

// Version is the configuration version being served; 0 before the first publish.
func (h *Handler) Version() int {
	if routes := h.routes.Load(); routes != nil {
		return routes.Version
	}
	return 0
}

type params struct {
	upstream    *url.URL
	client      string
	proto       string
	host        string
	requestID   string
	traceparent string
	timer       *time.Timer
}

type paramsKey struct{}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	target, ok := h.routes.Load().Match(r)
	if !ok {
		fail(w, http.StatusNotFound, "接口不存在", "No route matched")
		return
	}
	stage := strings.ToUpper(strings.TrimSpace(r.Header.Get("X-Ca-Stage")))
	if stage == "" {
		stage = DefaultStage
	}
	upstream, ok := h.endpoints.Load().Pick(target.Service.ID, stage)
	if !ok {
		fail(w, http.StatusServiceUnavailable, "服务暂不可用", "No available instance for stage "+stage)
		return
	}

	client, proto := h.client(r)
	p := &params{upstream: upstream, client: client, proto: proto, host: r.Host,
		requestID: requestID(r.Header.Get("X-Request-Id")), traceparent: traceparent(r.Header.Get("traceparent"))}
	ctx, cancel := context.WithCancelCause(context.WithValue(r.Context(), paramsKey{}, p))
	defer cancel(nil)
	timeout := defaultHeaderTimeout
	if target.Service.HeaderTimeoutMs > 0 {
		timeout = time.Duration(target.Service.HeaderTimeoutMs) * time.Millisecond
	}
	p.timer = time.AfterFunc(timeout, func() { cancel(errHeaderTimeout) })
	defer p.timer.Stop()
	h.proxy.ServeHTTP(w, r.WithContext(ctx))
}

// rewrite always sets the forwarding headers: kanyue.server hides PocketBase's
// own API from any request that carries them.
func rewrite(pr *httputil.ProxyRequest) {
	p := pr.In.Context().Value(paramsKey{}).(*params)
	pr.SetURL(p.upstream)
	header := pr.Out.Header
	header.Set("X-Forwarded-For", p.client)
	header.Set("X-Real-IP", p.client)
	header.Set("X-Forwarded-Proto", p.proto)
	header.Set("X-Forwarded-Host", p.host)
	header.Set("X-Request-Id", p.requestID)
	header.Set("traceparent", p.traceparent)
}

func stopHeaderTimer(res *http.Response) error {
	if p, ok := res.Request.Context().Value(paramsKey{}).(*params); ok {
		p.timer.Stop()
	}
	return nil
}

func (h *Handler) upstreamError(w http.ResponseWriter, r *http.Request, err error) {
	p := r.Context().Value(paramsKey{}).(*params)
	switch {
	case errors.Is(context.Cause(r.Context()), errHeaderTimeout):
		h.logger.Warn("Upstream timed out", "upstream", p.upstream.Host, "path", r.URL.Path)
		fail(w, http.StatusGatewayTimeout, "服务响应超时", "Upstream timeout")
	case r.Context().Err() != nil:
		// The client went away; nobody is left to answer.
	default:
		h.logger.Warn("Upstream failed", "upstream", p.upstream.Host, "path", r.URL.Path, "error", err.Error())
		fail(w, http.StatusBadGateway, "服务暂不可用", "Upstream unavailable")
	}
}

// client resolves the caller's address and scheme, believing forwarding headers
// only from trusted hops and reading X-Forwarded-For from the right.
func (h *Handler) client(r *http.Request) (string, string) {
	proto := "http"
	if r.TLS != nil {
		proto = "https"
	}
	addrPort, err := netip.ParseAddrPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr, proto
	}
	addr := addrPort.Addr().Unmap()
	if !h.isTrusted(addr) {
		return addr.String(), proto
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
	return addr.String(), proto
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

// fail answers in kanyue.server's envelope, with Aliyun's error header for clients that read it.
func fail(w http.ResponseWriter, status int, message, reason string) {
	body, _ := json.Marshal(map[string]any{"code": status, "message": message, "data": nil})
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("X-Ca-Error-Message", reason)
	w.WriteHeader(status)
	_, _ = w.Write(body)
}

var buffers = sync.Pool{New: func() any { b := make([]byte, 32*1024); return &b }}

type bufferPool struct{}

func (bufferPool) Get() []byte  { return *buffers.Get().(*[]byte) }
func (bufferPool) Put(b []byte) { buffers.Put(&b) }
