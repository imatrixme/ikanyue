package control

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"kanyue.gateway/internal/policy"
	"kanyue.gateway/internal/schema"
)

const manifestWithSchemas = `{"openapi":"3.1.0","info":{"title":"kanyue.server","version":"s"},"paths":{
	"/v1/orders":{
		"parameters":[{"name":"page","in":"query","schema":{"type":"integer","minimum":1}},{"name":"id","in":"path","required":true}],
		"get":{"x-kanyue-auth":"student","x-kanyue-idempotent":true},
		"post":{"x-kanyue-auth":"student",
			"parameters":[{"name":"page","in":"query","required":true,"schema":{"type":"integer","minimum":1}}],
			"requestBody":{"required":true,"content":{"application/json":{"schema":{"type":"object","required":["amount"],
				"properties":{"amount":{"type":"integer","minimum":1}}}}}}}},
	"/v1/ping":{"get":{"x-kanyue-auth":"public"}}}}`

// The manifest's parameters and JSON body become the operation's request
// schema; request-validation releases only where there is one, and rejects
// requests the schema refuses before they reach the service.
func TestRequestValidationFromManifest(t *testing.T) {
	c, app := newControl(t)
	service := registered(t, c, app, newFakeService(t, manifestWithSchemas))
	group, apis := draftGroup(t, app, "mapi", []string{"mapi.ikanyue.com"}, service.Id)

	post, _ := app.FindFirstRecordByData(schema.Operations, "method", "POST")
	request := requestSchemaOf(post)
	if request == nil || len(request.Query) != 1 || !request.Query[0].Required || request.Body == nil || !request.Body.Required {
		t.Fatalf("POST request schema = %+v", request)
	}
	ops, _ := app.FindAllRecords(schema.Operations)
	for _, op := range ops {
		got := requestSchemaOf(op)
		switch patternOf(op) {
		case "GET /v1/orders":
			if got == nil || len(got.Query) != 1 || got.Query[0].Required || got.Body != nil {
				t.Fatalf("GET inherits the path's optional page: %+v", got)
			}
		case "GET /v1/ping":
			if got != nil {
				t.Fatalf("ping declares nothing: %+v", got)
			}
		}
	}

	validation := []policy.Item{item("request-validation", `{"maxBodyBytes":1024}`)}
	ping := apis["GET /v1/ping"]
	if err := save(t, app, ping, map[string]any{"overrides": validation}); err != nil {
		t.Fatal(err)
	}
	if _, err := c.Release("ops", Request{Stage: "RELEASE", Targets: targetsOf(group, all(apis)...), Reason: "test"}); err == nil ||
		!strings.Contains(err.Error(), "no request schema") {
		t.Fatalf("released validation without a schema: %v", err)
	}
	if err := save(t, app, ping, map[string]any{"overrides": []policy.Item{}}); err != nil {
		t.Fatal(err)
	}
	if err := save(t, app, apis["POST /v1/orders"], map[string]any{"overrides": validation}); err != nil {
		t.Fatal(err)
	}
	release(t, c, "RELEASE", targetsOf(group, all(apis)...))

	send := func(target, body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(http.MethodPost, target, strings.NewReader(body))
		r.RemoteAddr = "203.0.113.9:5000"
		r.Header.Set("Content-Type", "application/json")
		recorder := httptest.NewRecorder()
		c.handler.ServeHTTP(recorder, r)
		return recorder
	}
	if res := send("http://mapi.ikanyue.com/v1/orders?page=1", `{"amount":3}`); res.Code != 200 || res.Body.String() != "kanyue.server POST /v1/orders" {
		t.Fatalf("valid order = %d %s", res.Code, res.Body.String())
	}
	if res := send("http://mapi.ikanyue.com/v1/orders?page=1", `{"amount":0}`); res.Code != 400 ||
		!strings.Contains(res.Header().Get("X-Ca-Error-Message"), "body.amount: must be at least 1") {
		t.Fatalf("invalid order = %d %v", res.Code, res.Header())
	}
	if res := send("http://mapi.ikanyue.com/v1/orders", `{"amount":3}`); res.Code != 400 ||
		!strings.Contains(res.Header().Get("X-Ca-Error-Message"), "query.page: is required") {
		t.Fatalf("order without page = %d %v", res.Code, res.Header())
	}
}
