package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/config"
	"kanyue.server/internal/gatewaylink"
	"kanyue.server/internal/server"
	"kanyue.server/internal/testkit"
)

// The gateway's manifest is the router itself: every route the modules serve is
// listed with its module and an auth scope, nothing else is, and only internal
// callers can read it.
func TestManifestClassifiesEveryRoute(t *testing.T) {
	app := testkit.NewApp(t)
	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	signer, err := auth.NewSigner(testkit.Secret)
	if err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{CourseCreditGrants: true, CourseCreditReservation: true, CourseCreditSettlement: true,
		CourseCreditMigration: true, CourseCommerce: true, PayGatewayURL: "http://127.0.0.1:1",
		PayServiceToken: strings.Repeat("s", 32), PayEventToken: strings.Repeat("e", 32), NodeEnv: "test"}
	server.Register(app, server.Config{Modules: modules(cfg, signer, nil)})
	if err := app.OnServe().Trigger(&core.ServeEvent{App: app, Router: router}, func(*core.ServeEvent) error { return nil }); err != nil {
		t.Fatal(err)
	}

	routes, err := gatewaylink.Routes(router)
	if err != nil {
		t.Fatal(err)
	}
	handler, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}
	fetch := func(remote string, headers map[string]string) *httptest.ResponseRecorder {
		request := httptest.NewRequest(http.MethodGet, gatewaylink.ManifestPath, nil)
		request.RemoteAddr = remote
		for key, value := range headers {
			request.Header.Set(key, value)
		}
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, request)
		return recorder
	}
	if public := fetch("203.0.113.9:4000", nil); public.Code != http.StatusNotFound {
		t.Fatalf("public manifest = %d", public.Code)
	}
	if proxied := fetch("127.0.0.1:4000", map[string]string{"X-Forwarded-For": "203.0.113.9"}); proxied.Code != http.StatusNotFound {
		t.Fatalf("proxied manifest = %d", proxied.Code)
	}
	internal := fetch("127.0.0.1:4000", nil)
	if internal.Code != http.StatusOK {
		t.Fatalf("internal manifest = %d", internal.Code)
	}
	var doc struct {
		OpenAPI string                                       `json:"openapi"`
		Paths   map[string]map[string]map[string]interface{} `json:"paths"`
	}
	if err := json.Unmarshal(internal.Body.Bytes(), &doc); err != nil || doc.OpenAPI != "3.1.0" {
		t.Fatalf("manifest = %v %s", err, internal.Body.String())
	}

	listed := map[string]map[string]interface{}{}
	for path, item := range doc.Paths {
		for method, op := range item {
			method = strings.ToUpper(method)
			if method == "X-KANYUE-ANY" {
				method = ""
			}
			listed[gatewaylink.Route{Method: method, Path: path}.Pattern()] = op
		}
	}
	served := map[string]bool{}
	for _, route := range routes {
		builtin := strings.HasPrefix(route.Path, "/api/") || strings.HasPrefix(route.Path, "/_/")
		if route.Path == gatewaylink.ManifestPath || (builtin && !(route.Method == http.MethodGet && strings.HasPrefix(route.Path, "/api/files/"))) {
			continue
		}
		served[route.Pattern()] = true
		op, ok := listed[route.Pattern()]
		if !ok {
			t.Errorf("%s is served but missing from the manifest", route.Pattern())
			continue
		}
		if op["x-kanyue-module"] == "" || op["x-kanyue-auth"] == "unclassified" {
			t.Errorf("%s: module %v, auth %v", route.Pattern(), op["x-kanyue-module"], op["x-kanyue-auth"])
		}
	}
	for pattern := range listed {
		if !served[pattern] {
			t.Errorf("%s is in the manifest but not served", pattern)
		}
	}
	if len(served) < 150 {
		t.Fatalf("only %d routes found; the router walk is incomplete", len(served))
	}
	for pattern, want := range map[string][2]string{
		"POST /v1/user/login":                               {"identity", "public"},
		"POST /v1/user/refresh":                             {"identity", "session"},
		"GET /v1/student/appointments":                      {"booking", "student"},
		"POST /internal/commerce/payment-events":            {"commerce", "service"},
		"GET /api/files/{collection}/{recordId}/{filename}": {"files", "public"},
		"/{path...}": {"console", "public"},
	} {
		op := listed[pattern]
		if op["x-kanyue-module"] != want[0] || op["x-kanyue-auth"] != want[1] {
			t.Errorf("%s = %v/%v, want %v", pattern, op["x-kanyue-module"], op["x-kanyue-auth"], want)
		}
	}

	// The gateway's exposure plans name this service's routes exactly and never
	// expose operator or service-to-service routes.
	plans, err := filepath.Glob("../kanyue.gateway/internal/exposure/*.json")
	if err != nil || len(plans) == 0 {
		t.Fatalf("no exposure plans: %v", err)
	}
	for _, file := range plans {
		raw, err := os.ReadFile(file)
		if err != nil {
			t.Fatal(err)
		}
		var plan struct {
			APIs []struct {
				Service    string   `json:"service"`
				Operations []string `json:"operations"`
			} `json:"apis"`
		}
		if err := json.Unmarshal(raw, &plan); err != nil {
			t.Fatal(err)
		}
		if len(plan.APIs) == 0 {
			t.Errorf("%s lists no APIs", filepath.Base(file))
		}
		for _, batch := range plan.APIs {
			if batch.Service != "kanyue.server" {
				continue
			}
			for _, pattern := range batch.Operations {
				op, ok := listed[pattern]
				if !ok {
					t.Errorf("%s exposes %s, which is not served", filepath.Base(file), pattern)
				} else if op["x-kanyue-auth"] == "ops" || op["x-kanyue-auth"] == "service" {
					t.Errorf("%s exposes %s, an %v route", filepath.Base(file), pattern, op["x-kanyue-auth"])
				}
			}
		}
	}
}
