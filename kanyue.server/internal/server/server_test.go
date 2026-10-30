package server

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/tenancy"
	"kanyue.server/internal/testkit"
)

// Without Hono behind it, a path no module owns answers with the client 404 envelope.
// Hono: pointsLite › light branch does not expose removed full-admin operation routes
func TestUnownedRouteIsNotFound(t *testing.T) {
	handler := testkit.Serve(t, testkit.NewApp(t), func(se *core.ServeEvent) {
		se.Router.GET("/v1/owned", func(e *core.RequestEvent) error { return e.JSON(http.StatusOK, map[string]any{"code": 10000}) })
		se.Router.Any("/{path...}", pages(nil))
	})
	for _, path := range []string{"/v1/course-credits/summary", "/swagger", "/", "/ops/dashboard", "/ops/assessment-templates"} {
		result := testkit.Call(t, handler, http.MethodGet, path, nil, nil)
		if result.Status != http.StatusNotFound || result.Body["message"] != "接口不存在" {
			t.Fatalf("%s = %d %v", path, result.Status, result.Body)
		}
	}
	if owned := testkit.Raw(t, handler, http.MethodGet, "/v1/owned", "", nil); owned.Status != http.StatusOK {
		t.Fatalf("owned = %d", owned.Status)
	}
}

// The admin SPA shares the origin: built files as they are, index.html for page
// navigations, and the 404 envelope for anything that is not asking for a page.
func TestPagesServeTheAdminConsole(t *testing.T) {
	console := fstest.MapFS{
		"index.html":         {Data: []byte("<div id=root>console</div>")},
		"assets/app-1a2b.js": {Data: []byte("console.log(1)")},
	}
	handler := testkit.Serve(t, testkit.NewApp(t), func(se *core.ServeEvent) {
		se.Router.Any("/{path...}", pages(console))
	})
	get := func(path, accept string) *httptest.ResponseRecorder {
		request := httptest.NewRequest(http.MethodGet, path, nil)
		request.Header.Set("Accept", accept)
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, request)
		return recorder
	}
	for _, path := range []string{"/", "/payments", "/students/abc"} {
		page := get(path, "text/html,application/xhtml+xml")
		if page.Code != http.StatusOK || !strings.Contains(page.Body.String(), "console") {
			t.Fatalf("%s = %d %q", path, page.Code, page.Body.String())
		}
	}
	asset := get("/assets/app-1a2b.js", "*/*")
	if asset.Code != http.StatusOK || !strings.Contains(asset.Header().Get("Cache-Control"), "immutable") {
		t.Fatalf("asset = %d %v", asset.Code, asset.Header())
	}
	for _, request := range []struct{ method, path string }{{http.MethodGet, "/v1/unknown"}, {http.MethodGet, "/assets/missing.js"},
		{http.MethodPost, "/payments"}} {
		result := testkit.Call(t, handler, request.method, request.path, nil, nil)
		if result.Status != http.StatusNotFound || result.Body["message"] != "接口不存在" {
			t.Fatalf("%s %s = %d %v", request.method, request.path, result.Status, result.Body)
		}
	}
}

func TestIsInternalRequest(t *testing.T) {
	cases := []struct {
		name   string
		remote string
		header string
		want   bool
	}{
		{"loopback", "127.0.0.1:5000", "", true},
		{"compose network", "172.18.0.4:5000", "", true},
		{"public address", "203.0.113.9:5000", "", false},
		{"through public proxy", "127.0.0.1:5000", "X-Forwarded-For", false},
		{"through nginx real ip", "127.0.0.1:5000", "X-Real-IP", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest("GET", "/api/collections/students/records", nil)
			r.RemoteAddr = tc.remote
			if tc.header != "" {
				r.Header.Set(tc.header, "203.0.113.9")
			}
			if got := IsInternalRequest(r); got != tc.want {
				t.Fatalf("got %v, want %v", got, tc.want)
			}
		})
	}
}

// Register wires the storage guard, the modules and the console together; PocketBase's
// own REST API stays reachable only from a direct private-network connection.
func TestRegisterHidesStorageFromPublicRequests(t *testing.T) {
	app := testkit.NewApp(t)
	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	Register(app, Config{
		Modules: []Module{{Name: "owned", Register: func(se *core.ServeEvent) {
			se.Router.GET("/v1/owned", func(e *core.RequestEvent) error { return e.JSON(http.StatusOK, map[string]any{"code": 10000}) })
		}}},
		Console: fstest.MapFS{"index.html": {Data: []byte("<div id=root></div>")}},
	})
	if err := app.OnServe().Trigger(&core.ServeEvent{App: app, Router: router}, func(*core.ServeEvent) error { return nil }); err != nil {
		t.Fatal(err)
	}
	handler, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}
	send := func(method, path, remote string, headers map[string]string) *httptest.ResponseRecorder {
		request := httptest.NewRequest(method, path, nil)
		request.RemoteAddr = remote
		for key, value := range headers {
			request.Header.Set(key, value)
		}
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, request)
		return recorder
	}
	hidden := func(recorder *httptest.ResponseRecorder) bool {
		return recorder.Code == http.StatusNotFound && strings.Contains(recorder.Body.String(), "接口不存在")
	}
	const public, private = "203.0.113.9:4000", "127.0.0.1:4000"
	proxied := map[string]string{"X-Forwarded-For": "203.0.113.9"}
	for _, item := range []struct {
		name, method, path, remote string
		headers                    map[string]string
		hidden                     bool
	}{
		{"public records", http.MethodGet, "/api/collections/students/records", public, nil, true},
		{"proxied records", http.MethodGet, "/api/collections/students/records", private, proxied, true},
		{"public dashboard", http.MethodGet, "/_/", public, nil, true},
		{"public dashboard root", http.MethodGet, "/_", public, nil, true},
		{"public file upload", http.MethodPost, "/api/files/students/x/a.png", public, nil, true},
		{"private records", http.MethodGet, "/api/collections/students/records", private, nil, false},
		{"public file download", http.MethodGet, "/api/files/students/x/a.png", public, nil, false},
	} {
		if got := hidden(send(item.method, item.path, item.remote, item.headers)); got != item.hidden {
			t.Errorf("%s: hidden = %v, want %v", item.name, got, item.hidden)
		}
	}
	if sql := send(http.MethodPost, "/api/sql", private, nil); sql.Code != http.StatusForbidden {
		t.Fatalf("SQL console from a private address = %d", sql.Code)
	}
	if owned := send(http.MethodGet, "/v1/owned", public, proxied); owned.Code != http.StatusOK {
		t.Fatalf("module route = %d", owned.Code)
	}
	if page := send(http.MethodGet, "/students", public, map[string]string{"Accept": "text/html"}); page.Code != http.StatusOK || !strings.Contains(page.Body.String(), "root") {
		t.Fatalf("console page = %d %s", page.Code, page.Body.String())
	}
}

// Plugin routes answer like missing routes unless the request tenant enabled the
// plugin; core routes keep working, and handlers get the tenant-scoped app.
func TestPluginRoutesNeedTheTenantPlugin(t *testing.T) {
	app := testkit.NewApp(t)
	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	tenantOf := func(e *core.RequestEvent) error {
		return e.JSON(http.StatusOK, map[string]any{"tenant": tenancy.ID(e.App)})
	}
	Register(app, Config{Modules: []Module{
		{Name: "core", Register: func(se *core.ServeEvent) { se.Router.GET("/v1/core", tenantOf) }},
		{Name: "pay", Plugin: tenancy.Payment, Register: func(se *core.ServeEvent) { se.Router.POST("/v1/pay/{id}", tenantOf) }},
	}})
	if err := app.OnServe().Trigger(&core.ServeEvent{App: app, Router: router}, func(*core.ServeEvent) error { return nil }); err != nil {
		t.Fatal(err)
	}
	handler, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}
	send := func(method, path string) *httptest.ResponseRecorder {
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, httptest.NewRequest(method, path, nil))
		return recorder
	}
	for _, path := range []string{"/v1/core", "/v1/pay/x"} {
		method := http.MethodGet
		if path != "/v1/core" {
			method = http.MethodPost
		}
		if got := send(method, path); got.Code != http.StatusOK || !strings.Contains(got.Body.String(), tenancy.DefaultID) {
			t.Fatalf("%s with payment = %d %s", path, got.Code, got.Body.String())
		}
	}
	plugin, err := app.FindFirstRecordByFilter("tenant_plugins", "plugin={:plugin}", dbx.Params{"plugin": tenancy.Payment})
	if err != nil {
		t.Fatal(err)
	}
	plugin.Set("status", "disabled")
	if err := app.Save(plugin); err != nil {
		t.Fatal(err)
	}
	if got := send(http.MethodPost, "/v1/pay/x"); got.Code != http.StatusNotFound || !strings.Contains(got.Body.String(), "接口不存在") {
		t.Fatalf("pay without the plugin = %d %s", got.Code, got.Body.String())
	}
	if got := send(http.MethodGet, "/v1/core"); got.Code != http.StatusOK {
		t.Fatalf("core without the plugin = %d", got.Code)
	}
}
