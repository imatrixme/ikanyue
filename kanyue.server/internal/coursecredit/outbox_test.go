package coursecredit

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/jsx"
	"kanyue.server/internal/testkit"
)

var outboxNow = time.Date(2026, 8, 21, 10, 0, 0, 0, time.UTC)

const webhookSecret = "0123456789abcdef-secret"

type fakeDispatcher struct {
	messages []OutboxMessage
	err      error
}

func (d *fakeDispatcher) Deliver(message OutboxMessage) error {
	d.messages = append(d.messages, message)
	return d.err
}

func outboxEvent(t *testing.T, app core.App, changes map[string]any) *core.Record {
	t.Helper()
	fields := map[string]any{
		"topic": "course-credit.order-granted", "aggregateType": "order", "aggregateId": "order-1",
		"payload": map[string]any{"operationId": "operation"}, "status": "pending", "attempts": 0,
	}
	for key, value := range changes {
		fields[key] = value
	}
	return testkit.Create(t, app, "outbox_events", fields)
}

func fixedOutbox(app core.App, dispatcher Dispatcher) *outboxService {
	service := newOutbox(app, dispatcher)
	service.clock = func() time.Time { return outboxNow }
	return service
}

func reload(t *testing.T, app core.App, record *core.Record) *core.Record {
	t.Helper()
	found, err := app.FindRecordById(record.Collection().Name, record.Id)
	if err != nil {
		t.Fatal(err)
	}
	return found
}

func failsWith(t *testing.T, err error, code string) {
	t.Helper()
	if err == nil || errorCode(err) != code {
		t.Fatalf("error = %v, want %s", err, code)
	}
}

// Hono: courseCreditOutboxService › outbox worker claims and sends committed events with provider idempotency
func TestOutboxSendsCommittedEventsWithProviderIdempotency(t *testing.T) {
	app := testkit.NewApp(t)
	event := outboxEvent(t, app, nil)
	outboxEvent(t, app, map[string]any{"status": "sent", "aggregateId": "order-2"})
	dispatcher := &fakeDispatcher{}

	result, err := fixedOutbox(app, dispatcher).deliverDue(jsx.Undefined{})
	if err != nil {
		t.Fatal(err)
	}
	if fmtJSON(result) != fmtJSON(map[string]any{"attempted": 1, "deadLetter": 0, "failed": 0, "sent": 1,
		"results": []any{map[string]any{"eventId": event.Id, "status": "sent"}}}) {
		t.Fatalf("summary = %v", result)
	}
	want := OutboxMessage{AggregateID: "order-1", AggregateType: "order", IdempotencyKey: event.Id,
		Payload: map[string]any{"operationId": "operation"}, Topic: "course-credit.order-granted"}
	if len(dispatcher.messages) != 1 || fmtJSON(dispatcher.messages[0]) != fmtJSON(want) {
		t.Fatalf("messages = %+v", dispatcher.messages)
	}
	sent := reload(t, app, event)
	if sent.GetString("status") != "sent" || sent.GetInt("attempts") != 1 ||
		!sent.GetDateTime("sentAt").Time().Equal(outboxNow) || !sent.GetDateTime("processingStartedAt").IsZero() {
		t.Fatalf("event = %v", sent.FieldsData())
	}
	again, err := fixedOutbox(app, dispatcher).deliverDue(jsx.Undefined{})
	if err != nil || again["attempted"] != 0 {
		t.Fatalf("second run = %v, %v", again, err)
	}
}

// Hono: courseCreditOutboxService › provider failure schedules exponential retry with a privacy-safe code
func TestOutboxFailureSchedulesExponentialRetry(t *testing.T) {
	app := testkit.NewApp(t)
	event := outboxEvent(t, app, nil)
	dispatcher := &fakeDispatcher{err: Fail("PROVIDER_DOWN", "private details", nil)}
	service := fixedOutbox(app, dispatcher)

	result, err := service.deliverDue(1.0)
	if err != nil || result["failed"] != 1 {
		t.Fatalf("result = %v, %v", result, err)
	}
	failure := reload(t, app, event)
	if failure.GetString("status") != "failed" || failure.GetString("lastErrorCode") != "PROVIDER_DOWN" ||
		!failure.GetDateTime("nextAttemptAt").Time().Equal(outboxNow.Add(time.Minute)) ||
		strings.Contains(fmtJSON(failure.FieldsData()), "private details") {
		t.Fatalf("failure = %v", failure.FieldsData())
	}
	// Not due before the retry time; the second failure doubles the delay.
	if result, _ := service.deliverDue(jsx.Undefined{}); result["attempted"] != 0 {
		t.Fatalf("early retry = %v", result)
	}
	later := outboxNow.Add(time.Minute)
	service.clock = func() time.Time { return later }
	if _, err := service.deliverDue(jsx.Undefined{}); err != nil {
		t.Fatal(err)
	}
	if retried := reload(t, app, event); retried.GetInt("attempts") != 2 ||
		!retried.GetDateTime("nextAttemptAt").Time().Equal(later.Add(2*time.Minute)) {
		t.Fatalf("retry = %v", retried.FieldsData())
	}
}

// Hono: courseCreditOutboxService › final failed attempt becomes visible as a dead letter
func TestOutboxFinalAttemptBecomesDeadLetter(t *testing.T) {
	app := testkit.NewApp(t)
	event := outboxEvent(t, app, map[string]any{"attempts": 2})
	service := fixedOutbox(app, &fakeDispatcher{err: Fail("HTTP_503", "failed", nil)})
	service.maxAttempts = 3

	result, err := service.deliverDue(jsx.Undefined{})
	if err != nil || result["deadLetter"] != 1 {
		t.Fatalf("result = %v, %v", result, err)
	}
	dead := reload(t, app, event)
	if dead.GetString("status") != "dead_letter" || !dead.GetDateTime("deadLetterAt").Time().Equal(outboxNow) ||
		!dead.GetDateTime("nextAttemptAt").IsZero() || dead.GetInt("attempts") != 3 {
		t.Fatalf("dead letter = %v", dead.FieldsData())
	}
	if again, _ := service.deliverDue(jsx.Undefined{}); again["attempted"] != 0 {
		t.Fatalf("dead letters are not retried: %v", again)
	}
}

// Hono: courseCreditOutboxService › worker retries stale processing events and respects batch limits
func TestOutboxRetriesStaleProcessingAndRespectsLimit(t *testing.T) {
	app := testkit.NewApp(t)
	stale := outboxEvent(t, app, map[string]any{"status": "processing", "processingStartedAt": outboxNow.Add(-3 * time.Minute)})
	fresh := outboxEvent(t, app, map[string]any{"status": "processing", "processingStartedAt": outboxNow.Add(-time.Minute)})
	pending := outboxEvent(t, app, map[string]any{"nextAttemptAt": outboxNow.Add(-time.Hour)})
	service := fixedOutbox(app, &fakeDispatcher{})
	service.staleProcessing = 2 * time.Minute

	if !strings.Contains(dueFilter(iso(outboxNow), iso(outboxNow.Add(-service.staleProcessing))), `processingStartedAt<="2026-08-21 09:58:00.000Z"`) {
		t.Fatal("stale filter")
	}
	first, err := service.deliverDue(1.0)
	if err != nil || first["attempted"] != 1 {
		t.Fatalf("limited = %v, %v", first, err)
	}
	second, err := service.deliverDue(jsx.Undefined{})
	if err != nil || second["attempted"] != 1 {
		t.Fatalf("rest = %v, %v", second, err)
	}
	for _, event := range []*core.Record{stale, pending} {
		if reload(t, app, event).GetString("status") != "sent" {
			t.Fatalf("%s not sent", event.Id)
		}
	}
	if reload(t, app, fresh).GetString("status") != "processing" {
		t.Fatal("a fresh claim must not be stolen")
	}
}

// Hono: courseCreditOutboxService › claim failure prevents external delivery
func TestOutboxClaimFailurePreventsDelivery(t *testing.T) {
	app := testkit.NewApp(t)
	outboxEvent(t, app, nil)
	app.OnRecordUpdate("outbox_events").BindFunc(func(e *core.RecordEvent) error {
		return errors.New("storage failed")
	})
	dispatcher := &fakeDispatcher{}

	if _, err := fixedOutbox(app, dispatcher).deliverDue(jsx.Undefined{}); err == nil {
		t.Fatal("claim failure must fail the run")
	}
	if len(dispatcher.messages) != 0 {
		t.Fatalf("delivered %d events without a claim", len(dispatcher.messages))
	}
}

// Hono: courseCreditOutboxService › dead-letter listing is paginated and omits payload contents
func TestOutboxDeadLettersPaginateWithoutPayload(t *testing.T) {
	app := testkit.NewApp(t)
	for i, code := range []string{"HTTP_500", "", "HTTP_429"} {
		outboxEvent(t, app, map[string]any{"status": "dead_letter", "lastErrorCode": code, "aggregateId": code + "x",
			"deadLetterAt": outboxNow.Add(-time.Duration(i) * time.Minute)})
	}
	outboxEvent(t, app, map[string]any{"status": "failed"})

	result, err := fixedOutbox(app, nil).listDeadLetters(map[string]string{"page": "2", "perPage": "2"})
	if err != nil {
		t.Fatal(err)
	}
	listed := result["items"].([]map[string]any)
	if result["totalItems"] != 3 || result["totalPages"] != 2 || len(listed) != 1 ||
		listed[0]["lastErrorCode"] != "HTTP_429" || listed[0]["payload"] != nil {
		t.Fatalf("page 2 = %v", result)
	}
	if _, has := listed[0]["payload"]; has {
		t.Fatal("payload leaked")
	}
	first, _ := fixedOutbox(app, nil).listDeadLetters(map[string]string{})
	rows := first["items"].([]map[string]any)
	if first["perPage"] != 20 || len(rows) != 3 || rows[0]["lastErrorCode"] != "HTTP_500" || rows[1]["lastErrorCode"] != "DELIVERY_FAILED" {
		t.Fatalf("page 1 = %v", first)
	}
	if capped, _ := fixedOutbox(app, nil).listDeadLetters(map[string]string{"perPage": "500"}); capped["perPage"] != 100 {
		t.Fatalf("perPage cap = %v", capped["perPage"])
	}
	_, err = fixedOutbox(app, nil).listDeadLetters(map[string]string{"page": "0"})
	failsWith(t, err, "OUTBOX_CONFIGURATION_INVALID")
}

// Hono: courseCreditOutboxService › outbox validation and helper contracts reject unsafe inputs
func TestOutboxHelpersRejectUnsafeInputs(t *testing.T) {
	for _, value := range []any{0.0, 201.0, "abc", nil, 1.5} {
		_, err := deliveryLimit(value)
		failsWith(t, err, "OUTBOX_LIMIT_INVALID")
	}
	if limit, _ := deliveryLimit(jsx.Undefined{}); limit != 50 {
		t.Fatalf("default limit = %d", limit)
	}
	if limit, _ := deliveryLimit("200"); limit != 200 {
		t.Fatalf("string limit = %d", limit)
	}
	if code := outboxErrorCode(Fail("http_429", "x", nil)); code != "HTTP_429" {
		t.Fatalf("code = %s", code)
	}
	if outboxErrorCode(Fail("private message!", "x", nil)) != "DELIVERY_FAILED" || outboxErrorCode(errors.New("boom")) != "DELIVERY_FAILED" {
		t.Fatal("unsafe codes must collapse")
	}
	filter := dueFilter(iso(outboxNow), "2026-08-21T09:55:00.000Z")
	if !strings.Contains(filter, `nextAttemptAt<="2026-08-21 10:00:00.000Z"`) || !strings.Contains(filter, `processingStartedAt<="2026-08-21 09:55:00.000Z"`) {
		t.Fatalf("filter = %s", filter)
	}
	if fmtJSON(deliverySummary([]map[string]any{})) != `{"attempted":0,"deadLetter":0,"failed":0,"results":[],"sent":0}` {
		t.Fatal("empty summary")
	}
	if projected := deadLetterProjection(map[string]any{"attempts": "", "lastErrorCode": ""}); projected["attempts"] != 0.0 || projected["lastErrorCode"] != "DELIVERY_FAILED" {
		t.Fatalf("projection = %v", projected)
	}
	valid := map[string]any{"id": "e1", "topic": "t", "aggregateType": "order", "aggregateId": "o1", "attempts": 0.0}
	failsWith(t, validateOutboxEvent(map[string]any{}), "OUTBOX_EVENT_INVALID")
	failsWith(t, validateOutboxEvent(copyWith(valid, "topic", "")), "OUTBOX_EVENT_INVALID")
	failsWith(t, validateOutboxEvent(copyWith(valid, "attempts", -1.0)), "OUTBOX_ATTEMPTS_INVALID")
	failsWith(t, validateOutboxEvent(copyWith(valid, "attempts", 1.5)), "OUTBOX_ATTEMPTS_INVALID")
	if err := validateOutboxEvent(valid); err != nil {
		t.Fatal(err)
	}
	_, err := outboxPositiveInteger(0.0, 5)
	failsWith(t, err, "OUTBOX_CONFIGURATION_INVALID")
	_, err = newOutbox(nil, nil).deliverDue(jsx.Undefined{})
	failsWith(t, err, "OUTBOX_DISPATCHER_REQUIRED")
	if retry := fixedOutbox(nil, nil).retryAt(outboxNow, 20); retry != iso(outboxNow.Add(time.Hour)) {
		t.Fatalf("retry cap = %s", retry)
	}
}

func copyWith(source map[string]any, key string, value any) map[string]any {
	result := copyMap(source)
	result[key] = value
	return result
}

// Hono: courseCreditRoutes › admin can list privacy-safe outbox dead letters
// Hono: courseCreditRoutes › admin can read course-credit operational metrics without recording a command
func TestOutboxRoutesDeliverListAndReportMetrics(t *testing.T) {
	app := testkit.NewApp(t)
	signer, err := auth.NewSigner(testkit.Secret)
	if err != nil {
		t.Fatal(err)
	}
	ops := func(capabilities ...string) map[string]string {
		token, err := signer.Sign("T1", "S1", "teacher", false, auth.Claims{"scope": auth.OpsScope, "courseCreditCapabilities": capabilities}, auth.OpsTokenTTL)
		if err != nil {
			t.Fatal(err)
		}
		return testkit.Bearer(token)
	}
	auditor, finance := ops(Audit), ops(Finance)
	dispatcher := &fakeDispatcher{}
	handler := testkit.Serve(t, app, LedgerModule{Signer: signer, Dispatcher: dispatcher}.Register)
	event := outboxEvent(t, app, nil)
	dead := outboxEvent(t, app, map[string]any{"status": "dead_letter", "deadLetterAt": outboxNow, "lastErrorCode": "HTTP_500"})
	defaultMetrics.reset()

	failed(t, testkit.Call(t, handler, http.MethodPost, "/ops/course-credits/workers/outbox/deliver", nil, finance), 403, "COURSE_CREDIT_CAPABILITY_REQUIRED", "finance")
	failed(t, testkit.Call(t, handler, http.MethodPost, "/ops/course-credits/workers/outbox/deliver", map[string]any{"limit": 0}, auditor), 400, "OUTBOX_LIMIT_INVALID", "limit")
	delivered := ok(t, testkit.Call(t, handler, http.MethodPost, "/ops/course-credits/workers/outbox/deliver", map[string]any{"limit": 10}, auditor), "deliver")
	if delivered["sent"] != 1.0 || delivered["traceId"] == "" || reload(t, app, event).GetString("status") != "sent" {
		t.Fatalf("deliver = %v", delivered)
	}
	// Without a JSON content type the body is ignored, like Hono's readOptionalJsonBody.
	request := httptest.NewRequest(http.MethodPost, "/ops/course-credits/workers/outbox/deliver", strings.NewReader("{bad"))
	request.Header.Set("Authorization", auditor["Authorization"])
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if !strings.Contains(recorder.Body.String(), `"code":10000`) {
		t.Fatalf("plain body = %s", recorder.Body.String())
	}

	listed := ok(t, testkit.Call(t, handler, http.MethodGet, "/ops/course-credits/outbox/dead-letters?perPage=5", nil, auditor), "dead letters")
	if rows := items(listed); len(rows) != 1 || rows[0]["id"] != dead.Id || listed["perPage"] != 5.0 || rows[0]["payload"] != nil {
		t.Fatalf("dead letters = %v", listed)
	}
	failed(t, testkit.Call(t, handler, http.MethodGet, "/ops/course-credits/outbox/dead-letters", nil, finance), 403, "COURSE_CREDIT_CAPABILITY_REQUIRED", "dead letters finance")

	metrics := ok(t, testkit.Call(t, handler, http.MethodGet, "/ops/course-credits/metrics", nil, auditor), "metrics")
	counters := metrics["counters"].(map[string]any)
	command := counters["commands"].(map[string]any)["deliverOutbox"].(map[string]any)
	if command["success"] != 2.0 || command["failure"] != 2.0 || counters["commandFailureTotal"] != 2.0 || len(counters["commands"].(map[string]any)) != 1 {
		t.Fatalf("counters = %v", counters)
	}
	gauges := metrics["gauges"].(map[string]any)
	if gauges["outboxBacklog"] != 0.0 || metrics["collectedAt"] == "" {
		t.Fatalf("gauges = %v", gauges)
	}
	failed(t, testkit.Call(t, handler, http.MethodGet, "/ops/course-credits/metrics", nil, finance), 403, "COURSE_CREDIT_CAPABILITY_REQUIRED", "metrics finance")

	off := testkit.Serve(t, testkit.NewApp(t), LedgerModule{Signer: signer}.Register)
	failed(t, testkit.Call(t, off, http.MethodPost, "/ops/course-credits/workers/outbox/deliver", nil, auditor), 400, "OUTBOX_DISPATCHER_REQUIRED", "no dispatcher")
}

func TestOutboxRunnerSkipsOverlappingTicks(t *testing.T) {
	app := testkit.NewApp(t)
	outboxEvent(t, app, nil)
	dispatcher := &fakeDispatcher{}
	runner := &outboxRunner{dispatcher: dispatcher}
	runner.mu.Lock()
	runner.tick(app)
	runner.mu.Unlock()
	if len(dispatcher.messages) != 0 {
		t.Fatal("a tick must not run while another delivery holds the runner")
	}
	runner.tick(app)
	if len(dispatcher.messages) != 1 {
		t.Fatalf("tick delivered %d", len(dispatcher.messages))
	}
}

type capturedWebhook struct {
	header http.Header
	body   string
}

func webhookServer(t *testing.T, status int) (*httptest.Server, *[]capturedWebhook) {
	t.Helper()
	calls := &[]capturedWebhook{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		*calls = append(*calls, capturedWebhook{header: r.Header.Clone(), body: string(body)})
		w.WriteHeader(status)
	}))
	t.Cleanup(server.Close)
	return server, calls
}

func webhookMessage() OutboxMessage {
	return OutboxMessage{AggregateID: "order-1", AggregateType: "order", IdempotencyKey: "event-1",
		Payload: map[string]any{"operationId": "operation-1"}, Topic: "course-credit.order-granted"}
}

// Hono: courseCreditNotificationDispatcher › signed webhook delivery preserves idempotency and event identity
func TestWebhookDeliverySignsAndPreservesIdentity(t *testing.T) {
	server, calls := webhookServer(t, http.StatusAccepted)
	dispatcher, err := NewWebhookDispatcher(server.URL+"/events", webhookSecret, jsx.Undefined{}, "")
	if err != nil {
		t.Fatal(err)
	}
	if err := dispatcher.Deliver(webhookMessage()); err != nil {
		t.Fatal(err)
	}
	call := (*calls)[0]
	if call.header.Get("Idempotency-Key") != "event-1" || call.header.Get("X-Kanyue-Event-Id") != "event-1" ||
		call.header.Get("X-Kanyue-Topic") != "course-credit.order-granted" || call.header.Get("Content-Type") != "application/json" ||
		call.header.Get("X-Kanyue-Signature") != signWebhook(call.body, call.header.Get("X-Kanyue-Timestamp"), webhookSecret) {
		t.Fatalf("headers = %v", call.header)
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(call.body), &payload); err != nil {
		t.Fatal(err)
	}
	if fmtJSON(payload["aggregate"]) != `{"id":"order-1","type":"order"}` || fmtJSON(payload["payload"]) != `{"operationId":"operation-1"}` ||
		payload["version"] != 1.0 || payload["eventId"] != "event-1" || payload["occurredAt"] != call.header.Get("X-Kanyue-Timestamp") {
		t.Fatalf("body = %s", call.body)
	}
	if !strings.HasPrefix(call.body, `{"eventId":"event-1","topic":"course-credit.order-granted","aggregate":`) {
		t.Fatalf("key order = %s", call.body)
	}
}

// Hono: courseCreditNotificationDispatcher › dispatcher reports provider, network, and timeout failures with safe codes
func TestWebhookDeliveryFailureCodes(t *testing.T) {
	rejected, _ := webhookServer(t, http.StatusTooManyRequests)
	dispatcher, _ := NewWebhookDispatcher(strings.Replace(rejected.URL, "127.0.0.1", "localhost", 1), webhookSecret, jsx.Undefined{}, "")
	failsWith(t, dispatcher.Deliver(webhookMessage()), "WEBHOOK_HTTP_429")

	closed := httptest.NewServer(http.NotFoundHandler())
	closed.Close()
	dispatcher, _ = NewWebhookDispatcher(closed.URL, webhookSecret, jsx.Undefined{}, "")
	failsWith(t, dispatcher.Deliver(webhookMessage()), "WEBHOOK_NETWORK_FAILED")

	release := make(chan struct{})
	slow := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-release:
		}
	}))
	t.Cleanup(slow.Close)
	t.Cleanup(func() { close(release) })
	dispatcher, _ = NewWebhookDispatcher(slow.URL, webhookSecret, 1.0, "")
	failsWith(t, dispatcher.Deliver(webhookMessage()), "WEBHOOK_TIMEOUT")
}

// Hono: courseCreditNotificationDispatcher › environment factory is optional but rejects partial or unsafe production configuration
func TestNotificationDispatcherFactory(t *testing.T) {
	if dispatcher, err := NewNotificationDispatcher("", "", "", ""); dispatcher != nil || err != nil {
		t.Fatalf("empty config = %v, %v", dispatcher, err)
	}
	_, err := NewNotificationDispatcher("https://notify.example.com/events", "", "", "")
	failsWith(t, err, "OUTBOX_WEBHOOK_CONFIG_INCOMPLETE")
	_, err = NewNotificationDispatcher("  ", webhookSecret, "", "")
	failsWith(t, err, "OUTBOX_WEBHOOK_CONFIG_INCOMPLETE")
	_, err = NewNotificationDispatcher("http://127.0.0.1/events", webhookSecret, "", "production")
	failsWith(t, err, "OUTBOX_WEBHOOK_URL_INSECURE")
	_, err = NewNotificationDispatcher("https://notify.example.com/events", webhookSecret, "abc", "")
	failsWith(t, err, "OUTBOX_WEBHOOK_TIMEOUT_INVALID")
	configured, err := NewNotificationDispatcher(" https://notify.example.com/events ", webhookSecret, "2500", "production")
	if err != nil || configured.(*WebhookDispatcher).timeout != 2500*time.Millisecond {
		t.Fatalf("configured = %v, %v", configured, err)
	}
	local, err := NewNotificationDispatcher("http://127.0.0.1:39000/events", webhookSecret, "", "")
	if err != nil || local.(*WebhookDispatcher).timeout != 10*time.Second {
		t.Fatalf("default timeout = %v, %v", local, err)
	}
}

// Hono: courseCreditNotificationDispatcher › dispatcher validates configuration and message contracts
func TestWebhookDispatcherValidatesConfigurationAndMessages(t *testing.T) {
	if target, err := validateWebhookURL("https://notify.example.com/events", "production"); err != nil || target != "https://notify.example.com/events" {
		t.Fatalf("https = %s, %v", target, err)
	}
	for _, loopback := range []string{"http://127.0.0.1:1/x", "http://[::1]:39000/events", "http://LOCALHOST/x"} {
		if _, err := validateWebhookURL(loopback, ""); err != nil {
			t.Fatalf("%s: %v", loopback, err)
		}
	}
	_, err := validateWebhookURL("not a url", "")
	failsWith(t, err, "OUTBOX_WEBHOOK_URL_INVALID")
	_, err = validateWebhookURL("http://notify.example.com/events", "")
	failsWith(t, err, "OUTBOX_WEBHOOK_URL_INSECURE")
	_, err = validateWebhookURL("ftp://127.0.0.1/events", "")
	failsWith(t, err, "OUTBOX_WEBHOOK_URL_INSECURE")
	_, err = NewWebhookDispatcher("https://notify.example.com/events", "short", jsx.Undefined{}, "")
	failsWith(t, err, "OUTBOX_WEBHOOK_SECRET_INVALID")
	_, err = webhookTimeout(0.0)
	failsWith(t, err, "OUTBOX_WEBHOOK_TIMEOUT_INVALID")
	if timeout, _ := webhookTimeout(jsx.Undefined{}); timeout != 10000 {
		t.Fatalf("default timeout = %d", timeout)
	}
	message := webhookMessage()
	message.Topic = ""
	err = validateMessage(message)
	failsWith(t, err, "OUTBOX_WEBHOOK_MESSAGE_INVALID")
	if err.(*Error).Details["field"] != "topic" {
		t.Fatalf("details = %v", err.(*Error).Details)
	}
	dispatcher, _ := NewWebhookDispatcher("https://notify.example.com/events", webhookSecret, jsx.Undefined{}, "")
	failsWith(t, dispatcher.Deliver(OutboxMessage{}), "OUTBOX_WEBHOOK_MESSAGE_INVALID")
}

// Hono: courseCreditMetrics › command metrics record success, conflicts, insufficiency, and settlement failures
func TestMetricsCountCommandOutcomes(t *testing.T) {
	ticks := []int{100, 112, 200, 230, 300, 350, 400, 470}
	metrics := NewMetrics(func() time.Time {
		next := ticks[0]
		ticks = ticks[1:]
		return time.UnixMilli(int64(next))
	})
	succeed := func() (map[string]any, error) { return map[string]any{"ok": true}, nil }
	failWith := func(err error) func() (map[string]any, error) {
		return func() (map[string]any, error) { return nil, err }
	}
	if result, err := metrics.measure("grantOrderCredits", succeed); err != nil || result["ok"] != true {
		t.Fatalf("success = %v, %v", result, err)
	}
	_, _ = metrics.measure("reserveSessionCredit", failWith(Fail("VERSION_CONFLICT", "conflict", nil)))
	_, _ = metrics.measure("reserveSessionCredit", failWith(Fail("CREDIT_INSUFFICIENT", "insufficient", nil)))
	if _, err := metrics.measure("settleSession", failWith(errors.New("storage failure"))); err == nil {
		t.Fatal("failures propagate")
	}
	want := `{"commandFailureTotal":3,"commandSuccessTotal":1,"commands":{"grantOrderCredits":{"success":1,"failure":0,"durationMsTotal":12},` +
		`"reserveSessionCredit":{"success":0,"failure":2,"durationMsTotal":80},"settleSession":{"success":0,"failure":1,"durationMsTotal":70}},` +
		`"conflictTotal":1,"insufficientCreditTotal":1,"settlementFailureTotal":1}`
	if got := fmtJSON(metrics.snapshot()); got != want {
		t.Fatalf("snapshot = %s", got)
	}
	metrics.reset()
	if metrics.snapshot()["commandSuccessTotal"] != 0 {
		t.Fatal("reset")
	}
}

// Hono: courseCreditMetrics › metrics snapshot combines runtime counters with durable operational gauges
func TestMetricsSnapshotReadsGauges(t *testing.T) {
	app := testkit.NewApp(t)
	put := func(collection string, fields map[string]any) {
		t.Helper()
		target, err := app.FindCollectionByNameOrId(collection)
		if err != nil {
			t.Fatal(err)
		}
		record := core.NewRecord(target)
		for key, value := range fields {
			record.Set(key, value)
		}
		if err := app.SaveNoValidate(record); err != nil {
			t.Fatal(err)
		}
	}
	for _, quantity := range []any{3, 2, 0} {
		put("credit_batches", map[string]any{"expiredQuantity": quantity, "status": "expired"})
	}
	for _, status := range []string{"pending", "failed", "processing", "processing", "sent", "dead_letter"} {
		outboxEvent(t, app, map[string]any{"status": status})
	}
	for _, status := range []string{"open", "open", "resolved"} {
		put("reconciliation_exceptions", map[string]any{"status": status})
	}
	for i, status := range []string{"credit_insufficient", "credit_insufficient", "reserved"} {
		put("session_students", map[string]any{"creditStatus": status, "sessionId": "session" + string(rune('a'+i)), "studentId": "student"})
	}
	oldest, err := app.FindFirstRecordByFilter("outbox_events", `status="pending"`)
	if err != nil {
		t.Fatal(err)
	}
	now := oldest.GetDateTime("created").Time().Add(60500 * time.Millisecond)

	snapshot, err := metricsSnapshot(app, NewMetrics(nil), now)
	if err != nil {
		t.Fatal(err)
	}
	if snapshot["collectedAt"] != iso(now) {
		t.Fatalf("collectedAt = %v", snapshot["collectedAt"])
	}
	want := `{"expiredQuantity":5,"insufficientReservations":2,"outboxBacklog":4,"outboxLagSeconds":60,"reconciliationDrift":2}`
	if got := fmtJSON(snapshot["gauges"]); got != want {
		t.Fatalf("gauges = %s", got)
	}
}

// Hono: courseCreditMetrics › metrics helpers normalize invalid names, values, and timestamps
func TestMetricsHelpersNormalize(t *testing.T) {
	if normalizeCommandName("  convertCredits  ") != "convertCredits" || normalizeCommandName("") != "unknown" {
		t.Fatal("names")
	}
	if gaugeNumber("4") != 4 || gaugeNumber(-1.0) != 0 || gaugeNumber("invalid") != 0 || gaugeNumber(nil) != 0 {
		t.Fatal("numbers")
	}
	now := time.Date(2026, 7, 17, 10, 0, 0, 0, time.UTC)
	if lagSeconds("", now) != 0 || lagSeconds("2026-07-17T10:01:00Z", now) != 0 || lagSeconds("garbage", now) != 0 {
		t.Fatal("lag")
	}
	if lagSeconds("2026-07-17 09:58:59.500Z", now) != 60 {
		t.Fatal("lag floor")
	}
}
