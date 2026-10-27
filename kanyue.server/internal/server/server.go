// Package server wires migrated modules in front of Hono: owned routes run in Go,
// PocketBase's own API stays internal, and everything else is proxied to Hono.
package server

import (
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/hook"
)

// Module is one migrated business area; listing its name in KANYUE_HONO_MODULES hands it back to Hono.
type Module struct {
	Name     string
	Register func(se *core.ServeEvent)
}

type Config struct {
	HonoURL     string
	HonoModules []string
	Modules     []Module
}

// Runs before PocketBase's own middlewares so storage routes never reach a handler.
const internalOnlyPriority = -99998

func Register(app core.App, cfg Config) error {
	proxy, err := NewHonoProxy(cfg.HonoURL)
	if err != nil {
		return err
	}
	handedBack := map[string]bool{}
	for _, name := range cfg.HonoModules {
		handedBack[strings.TrimSpace(name)] = true
	}

	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		se.Router.Bind(&hook.Handler[*core.RequestEvent]{
			Id:       "kanyueInternalOnly",
			Priority: internalOnlyPriority,
			Func:     internalOnly,
		})
		for _, module := range cfg.Modules {
			if handedBack[module.Name] {
				log.Printf("module served by Hono: %s", module.Name)
				continue
			}
			module.Register(se)
		}
		// More specific routes registered above win over this catch-all.
		se.Router.Any("/{path...}", func(e *core.RequestEvent) error {
			proxy.ServeHTTP(e.Response, e.Request)
			return nil
		})
		return se.Next()
	})
	return nil
}

// NewHonoProxy forwards requests to Hono unchanged; upstream failures keep the client envelope.
func NewHonoProxy(rawURL string) (http.Handler, error) {
	upstream, err := url.Parse(rawURL)
	if err != nil || upstream.Host == "" {
		return nil, fmt.Errorf("invalid HONO_UPSTREAM_URL %q", rawURL)
	}
	proxy := httputil.NewSingleHostReverseProxy(upstream)
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		log.Printf("hono proxy %s %s: %v", r.Method, r.URL.Path, err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte(`{"code":502,"message":"服务暂时不可用，请稍后重试","data":null}`))
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// PocketBase wraps bodies in a reader that rewinds at EOF; stop at Content-Length
		// so the transport does not read the body twice.
		if r.ContentLength > 0 {
			r.Body = struct {
				io.Reader
				io.Closer
			}{io.LimitReader(r.Body, r.ContentLength), r.Body}
		}
		proxy.ServeHTTP(w, r)
	}), nil
}

// internalOnly hides PocketBase's REST API and dashboard from anything that came
// through a reverse proxy or from a public address.
func internalOnly(e *core.RequestEvent) error {
	path := e.Request.URL.Path
	if !strings.HasPrefix(path, "/api/") && path != "/_" && !strings.HasPrefix(path, "/_/") {
		return e.Next()
	}
	if IsInternalRequest(e.Request) {
		return e.Next()
	}
	return e.JSON(http.StatusNotFound, map[string]any{"code": 404, "message": "接口不存在", "data": nil})
}

func IsInternalRequest(r *http.Request) bool {
	if r.Header.Get("X-Forwarded-For") != "" || r.Header.Get("X-Real-IP") != "" || r.Header.Get("Forwarded") != "" {
		return false
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return false
	}
	ip := net.ParseIP(host)
	return ip != nil && (ip.IsLoopback() || ip.IsPrivate())
}
