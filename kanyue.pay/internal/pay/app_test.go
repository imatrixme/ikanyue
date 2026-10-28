package pay

import (
	"net/http"
	"strings"
	"testing"
)

// The /v1 contract kanyue.server's commerce module and the admin call, end to end over HTTP.
func TestHTTPContractOverWechatMock(t *testing.T) {
	g := wechatSetup()
	cfg := must(LoadConfig(map[string]string{"NODE_ENV": "test", "PAY_PROVIDER": "wechatpay-mock",
		"PAY_SERVICE_TOKEN": serviceToken, "PAY_MOCK_TOKEN": mockToken}))
	handler := serve(t, g, cfg)
	service := func(key string) http.Header { return bearerHeader(serviceToken, "Idempotency-Key", key) }
	mock := bearerHeader(mockToken)

	created := call(t, handler, http.MethodPost, "/v1/payments",
		`{"reference":"http-order","amount":10000,"currency":"CNY","payerId":"openid_http","description":"课程"}`, service("pay"))
	id, _ := created.Body["id"].(string)
	if created.Status != 201 || created.Body["prepayId"] != nil || mapOf(created.Body["action"])["type"] != "wechatpay" {
		t.Fatalf("created = %v", created)
	}
	if call(t, handler, http.MethodPost, "/_test/observations/"+id, `{"status":"succeeded"}`, mock).Status != 200 ||
		call(t, handler, http.MethodPost, "/_test/wechatpay/notify/"+id, "", mock).Status != 200 {
		t.Fatal("mock payment")
	}
	refreshed := call(t, handler, http.MethodPost, "/v1/payments/"+id+"/refresh", "", service(""))
	if refreshed.Body["status"] != "succeeded" || refreshed.Body["action"] != nil {
		t.Fatalf("refreshed = %v", refreshed)
	}
	refund := call(t, handler, http.MethodPost, "/v1/refunds", `{"reference":"http-refund","paymentId":"`+id+`","amount":2000}`, service("refund"))
	refundID, _ := refund.Body["id"].(string)
	if refund.Status != 201 || call(t, handler, http.MethodGet, "/v1/refunds/"+refundID, "", service("")).Body["status"] != "processing" {
		t.Fatalf("refund = %v", refund)
	}
	if call(t, handler, http.MethodPost, "/v1/payments/"+id+"/close", "", service("")).Body["error"] != "PAYMENT_NOT_CLOSABLE" {
		t.Fatal("captured payment closed")
	}

	events := call(t, handler, http.MethodGet, "/v1/events", "", service("")).Body["items"].([]any)
	first := events[0].(map[string]any)
	if len(events) != 2 || call(t, handler, http.MethodPost, "/v1/events/"+first["id"].(string)+"/ack", "", service("")).Body["acknowledged"] != true ||
		len(call(t, handler, http.MethodGet, "/v1/events", "", service("")).Body["items"].([]any)) != 1 {
		t.Fatalf("events = %v", events)
	}
	if findings := call(t, handler, http.MethodPost, "/v1/reconciliation", "", service("")).Body["findings"].([]any); len(findings) != 0 {
		t.Fatalf("findings = %v", findings)
	}
	finance := call(t, handler, http.MethodGet, "/v1/finance", "", service("")).Body
	if finance["captured"] != 10000.0 || finance["refundReserved"] != 2000.0 || finance["provider"] != "mock" {
		t.Fatalf("finance = %v", finance)
	}
	if items := call(t, handler, http.MethodGet, "/v1/work", "", service("")).Body["items"].([]any); len(items) != 0 {
		t.Fatalf("work = %v", items)
	}
	if call(t, handler, http.MethodPost, "/v1/work/"+recordID("missing")+"/retry", `{"actorId":"admin","reason":"恢复"}`, service("")).Status != 404 {
		t.Fatal("retry of missing work")
	}

	date := chinaToday()
	downloaded := call(t, handler, http.MethodPost, "/v1/statements/download", `{"date":"`+date+`","actorId":"admin"}`, service(""))
	statementID, _ := downloaded.Body["id"].(string)
	if downloaded.Status != 200 || downloaded.Body["source"] != "channel" {
		t.Fatalf("download = %v", downloaded)
	}
	if call(t, handler, http.MethodPost, "/v1/statements/download", `{"date":"`+date+`"}`, service("")).Body["error"] != "ACTOR_REQUIRED" ||
		call(t, handler, http.MethodPost, "/v1/statements/import", `{"date":"`+date+`"}`, service("")).Body["error"] != "INVALID_STATEMENT" {
		t.Fatal("statement validation")
	}
	list := call(t, handler, http.MethodGet, "/v1/statements", "", service("")).Body["items"].([]any)
	detail := call(t, handler, http.MethodGet, "/v1/statements/"+statementID, "", service("")).Body
	if len(list) != 1 || len(detail["lines"].([]any)) != 2 {
		t.Fatalf("statements = %v %v", list, detail)
	}
	lineID := detail["lines"].([]any)[0].(map[string]any)["id"].(string)
	if call(t, handler, http.MethodPost, "/v1/statement-lines/"+lineID+"/resolve", `{"actorId":"admin","note":"已核对"}`, service("")).Body["resolved"] != true {
		t.Fatal("resolve")
	}
	settled := call(t, handler, http.MethodPost, "/v1/statements/"+statementID+"/settlement",
		`{"actorId":"admin","reference":"bank-http","amount":9940,"date":"`+date+`","evidenceHash":"`+strings.Repeat("b", 64)+`"}`, service(""))
	exported := call(t, handler, http.MethodGet, "/v1/statements/"+statementID+"/export", "", service("")).Body["content"]
	if settled.Body["id"] == nil || !strings.Contains(exported.(string), "已核对") {
		t.Fatalf("settlement = %v export = %v", settled, exported)
	}
	bill := call(t, handler, http.MethodGet, "/v1/providers/wechatpay/bills/"+date, "", service("")).Body
	if !strings.Contains(bill["content"].(string), id) || bill["mock"] != true {
		t.Fatalf("bill = %v", bill)
	}
	if call(t, handler, http.MethodPost, "/_test/poll", "", mock).Status != 200 {
		t.Fatal("test poll")
	}
	if call(t, handler, http.MethodGet, "/ready", "", nil).Body["status"] != "ready" {
		t.Fatal("ready")
	}
}

// Production and live configurations expose no test controls.
func TestTestControlsAbsentOutsideMockDevelopment(t *testing.T) {
	cfg := testConfig(t, nil)
	cfg.Mode = "production"
	handler := serve(t, setup(), cfg)
	if result := call(t, handler, http.MethodPost, "/_test/poll", "", bearerHeader(mockToken)); result.Status != 404 {
		t.Fatalf("poll = %v", result)
	}
}
