package server

import (
	"net/http"
	"strings"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/gatewaylink"
)

// registerModules registers each module and attributes the routes it added to
// it. Of PocketBase's own routes only public file downloads are published:
// internalOnly hides the rest.
func registerModules(se *core.ServeEvent, modules []Module) ([]gatewaylink.Operation, error) {
	builtin, err := gatewaylink.Routes(se.Router)
	if err != nil {
		return nil, err
	}
	seen := map[string]bool{}
	var ops []gatewaylink.Operation
	for _, route := range builtin {
		seen[route.Pattern()] = true
		if route.Method == http.MethodGet && strings.HasPrefix(route.Path, "/api/files/") {
			ops = append(ops, gatewaylink.Operation{Route: route, Module: "files"})
		}
	}
	for _, module := range modules {
		module.Register(se)
		routes, err := gatewaylink.Routes(se.Router)
		if err != nil {
			return nil, err
		}
		for _, route := range routes {
			if !seen[route.Pattern()] {
				seen[route.Pattern()] = true
				ops = append(ops, gatewaylink.Operation{Route: route, Module: module.Name})
			}
		}
	}
	return ops, nil
}

// authScopes says who may call a route, for the gateway's manifest; the first
// match wins. Rules with a method match one route exactly, rules ending in "/"
// match a path prefix, others match one path. A route no rule covers is
// "unclassified", which TestManifestClassifiesEveryRoute rejects.
var authScopes = []struct{ rule, auth string }{
	{"POST /v1/user/login", "public"},
	{"POST /v1/user/wechat-login", "public"},
	{"POST /v1/user/wechat-role-login", "public"},
	{"POST /ops/auth/login", "public"},
	{"POST /ops/auth/register", "public"},
	{"/v1/public/", "public"},
	{"/v1/activity/", "public"},
	{"/api/files/", "public"},
	{"/{path...}", "public"},
	{"/v1/user/", "session"},
	{"/v1/schedule/", "session"},
	{"/v1/student/", "student"},
	{"/v1/points/", "student"},
	{"/v1/reward-items", "student"},
	{"/v1/teacher/", "teacher"},
	{"/v1/workbench/", "teacher"},
	{"/ops/", "ops"},
	{"/internal/", "service"},
}

func classify(ops []gatewaylink.Operation) []gatewaylink.Operation {
	for i := range ops {
		ops[i].Auth = authScope(ops[i].Route)
	}
	return ops
}

func authScope(route gatewaylink.Route) string {
	for _, scope := range authScopes {
		var match bool
		switch {
		case strings.Contains(scope.rule, " "):
			match = scope.rule == route.Pattern()
		case strings.HasSuffix(scope.rule, "/"):
			match = strings.HasPrefix(route.Path, scope.rule)
		default:
			match = scope.rule == route.Path
		}
		if match {
			return scope.auth
		}
	}
	return "unclassified"
}
