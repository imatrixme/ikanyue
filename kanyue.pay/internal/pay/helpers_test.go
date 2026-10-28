package pay

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

var (
	sharedKeys     *MockKeys
	sharedKeysOnce sync.Once
)

// testKeys shares one RSA key set across tests; generating 2048-bit keys is slow.
func testKeys() *MockKeys {
	sharedKeysOnce.Do(func() { sharedKeys = MockCredentials() })
	return sharedKeys
}

// wantCode fails unless err carries code (or, for uncoded errors, contains it).
func wantCode(t *testing.T, err error, code string) {
	t.Helper()
	if err == nil || !strings.Contains(err.Error(), code) {
		t.Fatalf("error = %v, want %s", err, code)
	}
}

// must unwraps a call that the test expects to succeed; a panic fails the test.
func must[T any](value T, err error) T {
	if err != nil {
		panic(err)
	}
	return value
}

func ok(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}

// concurrently runs every action at once and returns their errors.
func concurrently(actions ...func() error) []error {
	errs := make([]error, len(actions))
	var wait sync.WaitGroup
	for i, action := range actions {
		wait.Add(1)
		go func() {
			defer wait.Done()
			errs[i] = action()
		}()
	}
	wait.Wait()
	return errs
}

func succeeded(errs []error) int {
	count := 0
	for _, err := range errs {
		if err == nil {
			count++
		}
	}
	return count
}

func serve(t *testing.T, svc Service, cfg Config) http.Handler {
	t.Helper()
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(app.Cleanup)
	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	Register(&core.ServeEvent{App: app, Router: router}, svc, cfg)
	mux, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}
	return mux
}

type reply struct {
	Status int
	Body   map[string]any
}

func call(t *testing.T, handler http.Handler, method, path, body string, headers http.Header) reply {
	t.Helper()
	var reader io.Reader
	if body != "" {
		reader = strings.NewReader(body)
	}
	request := httptest.NewRequest(method, path, reader)
	for key, values := range headers {
		request.Header[key] = values
	}
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	result := reply{Status: recorder.Code}
	if raw := bytes.TrimSpace(recorder.Body.Bytes()); len(raw) > 0 {
		json.Unmarshal(raw, &result.Body)
	}
	return result
}

func newRequest(target string) (*http.Request, error) {
	return http.NewRequest(http.MethodGet, target, nil)
}

func bearerHeader(token string, extra ...string) http.Header {
	header := http.Header{"Authorization": {"Bearer " + token}, "Content-Type": {"application/json"}}
	for i := 0; i+1 < len(extra); i += 2 {
		header.Set(extra[i], extra[i+1])
	}
	return header
}

func eventTypes(t *testing.T, g *Gateway) []string {
	t.Helper()
	types := []string{}
	for _, row := range must(g.Events()) {
		types = append(types, str(row.Data, "type"))
	}
	return types
}

func count(types []string, kind string) int {
	n := 0
	for _, value := range types {
		if value == kind {
			n++
		}
	}
	return n
}
