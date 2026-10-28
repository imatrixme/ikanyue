package pay

import (
	"strings"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.pay/internal/gatewaylink"
)

// authScopes says who may call a route, for kanyue.gateway's manifest; the
// first prefix (or exact path) that matches wins. TestManifestListsThePaymentAPI
// rejects a route no rule covers.
var authScopes = []struct{ rule, auth string }{
	{"/health", "public"},
	{"/ready", "public"},
	{"/callbacks/", "public"}, // authenticated by the provider's signature
	{"/v1/", "service"},
	{"/_test/", "test"},
}

// RegisterWithManifest registers the payment API and serves the manifest of
// exactly the routes it added, to internal callers only.
func RegisterWithManifest(se *core.ServeEvent, svc Service, cfg Config) ([]byte, error) {
	builtin, err := gatewaylink.Routes(se.Router)
	if err != nil {
		return nil, err
	}
	seen := map[string]bool{}
	for _, route := range builtin {
		seen[route.Pattern()] = true
	}
	Register(se, svc, cfg)
	routes, err := gatewaylink.Routes(se.Router)
	if err != nil {
		return nil, err
	}
	var ops []gatewaylink.Operation
	for _, route := range routes {
		if !seen[route.Pattern()] {
			ops = append(ops, gatewaylink.Operation{Route: route, Module: "pay", Auth: authScope(route.Path)})
		}
	}
	manifest := gatewaylink.Manifest("kanyue.pay", gatewaylink.Version(), ops)
	se.Router.GET(gatewaylink.ManifestPath, gatewaylink.ManifestHandler(manifest, gatewaylink.IsInternal))
	return manifest, nil
}

func authScope(path string) string {
	for _, scope := range authScopes {
		if path == scope.rule || (strings.HasSuffix(scope.rule, "/") && strings.HasPrefix(path, scope.rule)) {
			return scope.auth
		}
	}
	return "unclassified"
}
