package server

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/tools/router"
)

func TestHonoProxyForwardsRereadableBodyOnce(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		_, _ = w.Write([]byte(r.Method + " " + r.URL.RequestURI() + " " + r.Header.Get("Authorization") + " " + string(body)))
	}))
	defer upstream.Close()
	proxy, err := NewHonoProxy(upstream.URL)
	if err != nil {
		t.Fatal(err)
	}

	payload := `{"username":"x"}`
	r := httptest.NewRequest("POST", "/ops/auth/login?a=1", strings.NewReader(payload))
	r.Header.Set("Authorization", "Bearer t")
	r.Body = &router.RereadableReadCloser{ReadCloser: r.Body} // what PocketBase's router hands us
	w := httptest.NewRecorder()
	proxy.ServeHTTP(w, r)

	if want := "POST /ops/auth/login?a=1 Bearer t " + payload; w.Code != 200 || w.Body.String() != want {
		t.Fatalf("got %d %q, want %q", w.Code, w.Body.String(), want)
	}
}

func TestHonoProxyDownKeepsEnvelope(t *testing.T) {
	proxy, err := NewHonoProxy("http://127.0.0.1:1")
	if err != nil {
		t.Fatal(err)
	}
	w := httptest.NewRecorder()
	proxy.ServeHTTP(w, httptest.NewRequest("GET", "/v1/student/appointments", nil))
	if w.Code != http.StatusBadGateway || !strings.Contains(w.Body.String(), `"code":502`) {
		t.Fatalf("got %d %s", w.Code, w.Body.String())
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
