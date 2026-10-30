// Package server wires the business modules: owned routes run in Go, PocketBase's
// own API stays internal, the admin SPA is served on the same origin as /ops, and
// every other path answers with the 404 envelope.
package server

import (
	"io/fs"
	"net"
	"net/http"
	"path"
	"strings"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/hook"

	"kanyue.server/internal/gatewaylink"
	"kanyue.server/internal/tenancy"
)

// Module is one business area's routes. A module with a Plugin answers 404 for
// tenants that have not enabled it.
type Module struct {
	Name     string
	Plugin   string
	Register func(se *core.ServeEvent)
}

type Config struct {
	Modules []Module
	// Console is the built admin SPA; nil serves no pages.
	Console fs.FS
	// Registration announces this instance to kanyue.gateway; nil does not register.
	Registration *gatewaylink.Registration
}

// Runs before PocketBase's own middlewares so storage routes never reach a handler.
const internalOnlyPriority = -99998

// Scopes module routes right after the storage guard.
const tenantPriority = internalOnlyPriority + 1

func Register(app core.App, cfg Config) {
	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		se.Router.Bind(&hook.Handler[*core.RequestEvent]{
			Id:       "kanyueInternalOnly",
			Priority: internalOnlyPriority,
			Func:     internalOnly,
		})
		// plugins maps a plugin module's route pattern to its plugin; filled below, before serving.
		plugins := map[string]string{}
		se.Router.Bind(&hook.Handler[*core.RequestEvent]{
			Id:       "kanyueTenant",
			Priority: tenantPriority,
			Func:     func(e *core.RequestEvent) error { return scopeTenant(e, plugins) },
		})
		ops, err := registerModules(se, cfg.Modules)
		if err != nil {
			return err
		}
		for _, module := range cfg.Modules {
			for _, op := range ops {
				if module.Plugin != "" && op.Module == module.Name {
					plugins[op.Route.Pattern()] = module.Plugin
				}
			}
		}
		// More specific routes registered above win over this catch-all.
		se.Router.Any("/{path...}", pages(cfg.Console))
		ops = append(ops, gatewaylink.Operation{Route: gatewaylink.Route{Path: "/{path...}"}, Module: "console"})
		manifest := gatewaylink.Manifest("kanyue.server", gatewaylink.Version(), classify(ops))
		se.Router.GET(gatewaylink.ManifestPath, gatewaylink.ManifestHandler(manifest, IsInternalRequest))
		if cfg.Registration != nil {
			gatewaylink.Start(se.App, *cfg.Registration, manifest)
		}
		return se.Next()
	})
}

func notFound(e *core.RequestEvent) error {
	return e.JSON(http.StatusNotFound, map[string]any{"code": 404, "message": "接口不存在", "data": nil})
}

// pages serves built admin files as they are and index.html for any other page
// navigation, so client-side routes survive a reload. Requests that do not ask
// for HTML (API calls, missing assets) keep the 404 envelope.
func pages(console fs.FS) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		method := e.Request.Method
		if console == nil || (method != http.MethodGet && method != http.MethodHead) {
			return notFound(e)
		}
		name := strings.TrimPrefix(path.Clean("/"+e.Request.URL.Path), "/")
		if info, err := fs.Stat(console, name); err == nil && !info.IsDir() && name != "index.html" {
			if strings.HasPrefix(name, "assets/") {
				e.Response.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			}
			return e.FileFS(console, name)
		}
		if !strings.Contains(e.Request.Header.Get("Accept"), "text/html") {
			return notFound(e)
		}
		if _, err := fs.Stat(console, "index.html"); err != nil {
			return notFound(e)
		}
		e.Response.Header().Set("Cache-Control", "no-cache")
		return e.FileFS(console, "index.html")
	}
}

// internalOnly hides PocketBase's REST API and dashboard from anything that came
// through a reverse proxy or from a public address. File downloads stay public:
// stored avatar and image URLs point at /api/files, and collection file rules still apply.
func internalOnly(e *core.RequestEvent) error {
	path := e.Request.URL.Path
	if !strings.HasPrefix(path, "/api/") && path != "/_" && !strings.HasPrefix(path, "/_/") {
		return e.Next()
	}
	// PocketBase's SQL console would let a superuser write business data past every hook.
	if strings.TrimSuffix(path, "/") == "/api/sql" {
		return e.ForbiddenError("The SQL console is disabled.", nil)
	}
	if strings.HasPrefix(path, "/api/files/") && (e.Request.Method == http.MethodGet || e.Request.Method == http.MethodHead) {
		return e.Next()
	}
	if IsInternalRequest(e.Request) {
		return e.Next()
	}
	return notFound(e)
}

// scopeTenant hands module routes an App limited to the request's tenant and
// hides plugin routes the tenant has not enabled. PocketBase's own API and
// dashboard stay unscoped for platform operations.
func scopeTenant(e *core.RequestEvent, plugins map[string]string) error {
	path := e.Request.URL.Path
	if strings.HasPrefix(path, "/api/") || path == "/_" || strings.HasPrefix(path, "/_/") {
		return e.Next()
	}
	tenant := tenancy.Resolve(e)
	e.App = tenancy.Scope(e.App, tenant)
	if plugin := plugins[e.Request.Pattern]; plugin != "" && !tenancy.PluginEnabled(e.App, tenant, plugin) {
		return notFound(e)
	}
	return e.Next()
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
