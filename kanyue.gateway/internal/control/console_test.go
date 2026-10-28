package control

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

// The console is served from the admin plane: hashed assets cache for good,
// client-side routes fall back to index.html, everything carries the CSP.
func TestConsolePages(t *testing.T) {
	_, app := newControl(t)
	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	bindConsole(&core.ServeEvent{App: app, Router: router}, fstest.MapFS{
		"index.html":       {Data: []byte("<html>console</html>")},
		"assets/app-1.js":  {Data: []byte("console.log(1)")},
		"assets/app-1.css": {Data: []byte("body{}")},
	})
	mux, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}
	get := func(path string) *httptest.ResponseRecorder {
		recorder := httptest.NewRecorder()
		mux.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, path, nil))
		return recorder
	}

	if got := get("/console"); got.Code != http.StatusFound || got.Header().Get("Location") != "/console/" {
		t.Fatalf("/console = %d %s", got.Code, got.Header().Get("Location"))
	}
	for _, path := range []string{"/console/", "/console/routes", "/console/index.html"} {
		got := get(path)
		if got.Code != http.StatusOK || !strings.Contains(got.Body.String(), "console</html>") || got.Header().Get("Cache-Control") != "no-cache" {
			t.Fatalf("%s = %d %q cache %q", path, got.Code, got.Body.String(), got.Header().Get("Cache-Control"))
		}
		if !strings.Contains(got.Header().Get("Content-Security-Policy"), "default-src 'self'") {
			t.Fatalf("%s has no CSP", path)
		}
	}
	if got := get("/console/assets/app-1.js"); got.Code != http.StatusOK || !strings.Contains(got.Header().Get("Cache-Control"), "immutable") {
		t.Fatalf("asset = %d %s", got.Code, got.Header().Get("Cache-Control"))
	}
	if got := get("/console/assets/missing.js"); got.Code != http.StatusNotFound {
		t.Fatalf("missing asset = %d", got.Code)
	}
	if got := get("/console/../api/collections"); got.Code == http.StatusOK && strings.Contains(got.Body.String(), "items") {
		t.Fatal("path escaped the console")
	}
}
