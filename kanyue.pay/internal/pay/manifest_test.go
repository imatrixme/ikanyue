package pay

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"kanyue.pay/internal/gatewaylink"
)

// The manifest lists every payment route, mock controls included in test mode,
// classifies each one, and is hidden from anything that is not a direct internal call.
func TestManifestListsThePaymentAPI(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	cfg := must(LoadConfig(map[string]string{"NODE_ENV": "test", "PAY_PROVIDER": "wechatpay-mock",
		"PAY_SERVICE_TOKEN": serviceToken, "PAY_MOCK_TOKEN": mockToken}))
	manifest, err := RegisterWithManifest(&core.ServeEvent{App: app, Router: router}, wechatSetup(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	handler, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}

	fetch := func(remote, forwarded string) *httptest.ResponseRecorder {
		request := httptest.NewRequest(http.MethodGet, gatewaylink.ManifestPath, nil)
		request.RemoteAddr = remote
		if forwarded != "" {
			request.Header.Set("X-Forwarded-For", forwarded)
		}
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, request)
		return recorder
	}
	if fetch("203.0.113.9:4000", "").Code != http.StatusNotFound || fetch("127.0.0.1:4000", "203.0.113.9").Code != http.StatusNotFound {
		t.Fatal("manifest reachable from outside")
	}
	sql := httptest.NewRecorder()
	handler.ServeHTTP(sql, httptest.NewRequest(http.MethodPost, "/api/sql", strings.NewReader(`{"query":"select 1"}`)))
	if sql.Code != http.StatusForbidden {
		t.Fatalf("SQL console = %d", sql.Code)
	}
	internal := fetch("10.0.0.5:4000", "")
	if internal.Code != http.StatusOK || internal.Body.String() != string(manifest) {
		t.Fatalf("internal manifest = %d", internal.Code)
	}

	var doc struct {
		Info  map[string]string                            `json:"info"`
		Paths map[string]map[string]map[string]interface{} `json:"paths"`
	}
	if err := json.Unmarshal(manifest, &doc); err != nil || doc.Info["title"] != "kanyue.pay" {
		t.Fatalf("manifest = %v %s", err, manifest)
	}
	count := 0
	for path, item := range doc.Paths {
		for method, op := range item {
			count++
			if op["x-kanyue-module"] != "pay" || op["x-kanyue-auth"] == "unclassified" {
				t.Errorf("%s %s = %v", method, path, op)
			}
		}
	}
	for pattern, auth := range map[string]string{"post /v1/payments": "service", "post /callbacks/wechatpay": "public",
		"post /_test/poll": "test", "get /health": "public"} {
		method, path, _ := strings.Cut(pattern, " ")
		if doc.Paths[path][method]["x-kanyue-auth"] != auth {
			t.Errorf("%s auth = %v, want %s", pattern, doc.Paths[path][method]["x-kanyue-auth"], auth)
		}
	}
	if count < 20 {
		t.Fatalf("only %d operations listed", count)
	}
	if doc.Paths[gatewaylink.ManifestPath] != nil {
		t.Fatal("the manifest lists itself")
	}
}
