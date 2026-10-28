package plugin

import (
	"encoding/json"
	"io"
	"net/http/httptest"
	"strings"
	"testing"
)

func validating(t *testing.T, request *RequestSchema, config string) (*Chain, error) {
	t.Helper()
	return NewChain([]Binding{bind("request-validation", config)}, nil,
		Scope{Env: testEnv(&clock{start}), Route: "r1", RouteName: "route", Service: "svc", Request: request})
}

func schemaOf(t *testing.T, raw string) *RequestSchema {
	t.Helper()
	var request RequestSchema
	if err := json.Unmarshal([]byte(raw), &request); err != nil {
		t.Fatal(err)
	}
	return &request
}

// Parameters are read as their schema's type, the body is checked and then
// still reaches the upstream, and failures name what is wrong.
func TestRequestValidation(t *testing.T) {
	if _, err := validating(t, nil, `{}`); err == nil || !strings.Contains(err.Error(), "no request schema") {
		t.Fatalf("built without a schema: %v", err)
	}
	if _, err := validating(t, schemaOf(t, `{"body":{"schema":{"$ref":"#/components/schemas/Order"}}}`), `{}`); err == nil {
		t.Fatal("built with an unresolved $ref")
	}
	chain, err := validating(t, schemaOf(t, `{
		"query":[{"name":"page","schema":{"type":"integer","minimum":1}},{"name":"tags","schema":{"type":"array","items":{"type":"string","enum":["a","b"]}}}],
		"header":[{"name":"X-Ca-Version","required":true,"schema":{"type":"string","enum":["1"]}}],
		"body":{"required":true,"schema":{"type":"object","required":["amount"],"properties":{
			"amount":{"type":"integer","minimum":1},"note":{"type":"string","pattern":"("}}}}}`), `{"maxBodyBytes":64}`)
	if err != nil {
		t.Fatal(err)
	}
	send := func(target, contentType, body string, header map[string]string) *Reply {
		ctx := request("POST", target, header)
		ctx.Request = httptest.NewRequest("POST", target, strings.NewReader(body))
		ctx.Request.Header.Set("Content-Type", contentType)
		for key, value := range header {
			ctx.Request.Header.Set(key, value)
		}
		reply := chain.Request(ctx)
		if reply == nil {
			forwarded, _ := io.ReadAll(ctx.Request.Body)
			again, _ := ctx.Request.GetBody()
			replayed, _ := io.ReadAll(again)
			if string(forwarded) != body || string(replayed) != body || ctx.Request.ContentLength != int64(len(body)) {
				t.Fatalf("body after validation = %q, replay %q", forwarded, replayed)
			}
		}
		return reply
	}
	version := map[string]string{"X-Ca-Version": "1"}

	if reply := send("/orders?page=2&tags=a,b", "application/json; charset=utf-8", `{"amount":5}`, version); reply != nil {
		t.Fatalf("valid request = %+v", reply)
	}
	for _, c := range []struct {
		target, contentType, body string
		header                    map[string]string
		status                    int
		reason                    string
	}{
		{"/orders", "application/json", `{"amount":5}`, nil, 400, "header.X-Ca-Version: is required"},
		{"/orders?page=0", "application/json", `{"amount":5}`, version, 400, "query.page: must be at least 1"},
		{"/orders?page=x", "application/json", `{"amount":5}`, version, 400, "query.page: must be a number"},
		{"/orders?tags=a,c", "application/json", `{"amount":5}`, version, 400, "query.tags[1]: must be one of"},
		{"/orders", "application/json", ``, version, 400, "body: is required"},
		{"/orders", "text/plain", `{"amount":5}`, version, 400, `body: must be application/json, not "text/plain"`},
		{"/orders", "application/json", `{"amount":`, version, 400, "body: is not valid JSON"},
		{"/orders", "application/json", `{"amount":1.5}`, version, 400, "body.amount: must be a whole number"},
		{"/orders", "application/json", `{"amount":1,"note":"x"}`, version, 400, "body.note: must match ("},
		{"/orders", "application/json", `{"amount":1,"note":"` + strings.Repeat("x", 64) + `"}`, version, 413, "Request body too large"},
	} {
		reply := send(c.target, c.contentType, c.body, c.header)
		if reply == nil || reply.Status != c.status || !strings.Contains(reply.Reason, c.reason) {
			t.Errorf("%s %s = %+v, want %d %s", c.target, c.body, reply, c.status, c.reason)
		}
	}
}
