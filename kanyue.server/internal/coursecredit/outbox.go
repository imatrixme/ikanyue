package coursecredit

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/jsx"
)

// Hono's outboxService and notificationDispatcher: committed outbox events are
// claimed, sent to a signed webhook and retried with exponential backoff until
// they land or become dead letters. Go runs delivery in-process every minute,
// replacing Hono's optional external worker.

const (
	outboxDefaultLimit = 50
	outboxMaxLimit     = 200
	outboxSchedule     = "* * * * *"
)

// OutboxMessage is what a dispatcher receives; IdempotencyKey is the event id.
type OutboxMessage struct {
	AggregateID    string
	AggregateType  string
	IdempotencyKey string
	Payload        any
	Topic          string
}

// Dispatcher delivers one outbox event; a failure's *Error code is recorded on the event.
type Dispatcher interface {
	Deliver(message OutboxMessage) error
}

// outboxService is CourseCreditOutboxService with Hono's default options.
type outboxService struct {
	app             core.App
	dispatcher      Dispatcher
	clock           func() time.Time
	maxAttempts     int
	baseRetry       time.Duration
	maxRetry        time.Duration
	staleProcessing time.Duration
}

func newOutbox(app core.App, dispatcher Dispatcher) *outboxService {
	return &outboxService{app: app, dispatcher: dispatcher, clock: clock, maxAttempts: 5,
		baseRetry: time.Minute, maxRetry: time.Hour, staleProcessing: 5 * time.Minute}
}

func (o *outboxService) deliverDue(limitValue any) (map[string]any, error) {
	if o.dispatcher == nil {
		return nil, Fail("OUTBOX_DISPATCHER_REQUIRED", "Outbox delivery requires a notification dispatcher", nil)
	}
	limit, err := deliveryLimit(limitValue)
	if err != nil {
		return nil, err
	}
	now := o.clock()
	events, err := list(o.app, "outbox_events", dueFilter(iso(now), iso(now.Add(-o.staleProcessing))), "nextAttemptAt,created,id")
	if err != nil {
		return nil, err
	}
	results := []map[string]any{}
	for _, event := range events[:min(limit, len(events))] {
		result, err := o.deliverOne(event, now)
		if err != nil {
			return nil, err
		}
		results = append(results, result)
	}
	return deliverySummary(results), nil
}

func (o *outboxService) deliverOne(event map[string]any, now time.Time) (map[string]any, error) {
	if err := validateOutboxEvent(event); err != nil {
		return nil, err
	}
	id := event["id"].(string)
	// The claim must commit before anything leaves the process.
	if err := send(o.app, []step{update("outbox_events", id, map[string]any{
		"processingStartedAt": iso(now), "status": "processing",
	})}); err != nil {
		return nil, err
	}
	attempt := int(jsx.Number(or(event["attempts"], 0))) + 1
	err := o.dispatcher.Deliver(OutboxMessage{
		AggregateID:    event["aggregateId"].(string),
		AggregateType:  event["aggregateType"].(string),
		IdempotencyKey: id,
		Payload:        event["payload"],
		Topic:          event["topic"].(string),
	})
	if err != nil {
		return o.recordFailure(id, attempt, now, err)
	}
	if err := send(o.app, []step{update("outbox_events", id, map[string]any{
		"attempts": attempt, "deadLetterAt": "", "lastErrorAt": "", "lastErrorCode": "",
		"nextAttemptAt": "", "processingStartedAt": "", "sentAt": iso(now), "status": "sent",
	})}); err != nil {
		return nil, err
	}
	return map[string]any{"eventId": id, "status": "sent"}, nil
}

func (o *outboxService) recordFailure(id string, attempt int, now time.Time, cause error) (map[string]any, error) {
	deadLetter := attempt >= o.maxAttempts
	status, nextAttemptAt, deadLetterAt := "failed", o.retryAt(now, attempt), ""
	if deadLetter {
		status, nextAttemptAt, deadLetterAt = "dead_letter", "", iso(now)
	}
	if err := send(o.app, []step{update("outbox_events", id, map[string]any{
		"attempts": attempt, "deadLetterAt": deadLetterAt, "lastErrorAt": iso(now),
		"lastErrorCode": outboxErrorCode(cause), "nextAttemptAt": nextAttemptAt,
		"processingStartedAt": "", "status": status,
	})}); err != nil {
		return nil, err
	}
	return map[string]any{"eventId": id, "nextAttemptAt": nextAttemptAt, "status": status}, nil
}

func (o *outboxService) retryAt(now time.Time, attempt int) string {
	delay := math.Min(float64(o.baseRetry)*math.Pow(2, float64(max(0, attempt-1))), float64(o.maxRetry))
	return iso(now.Add(time.Duration(delay)))
}

func (o *outboxService) listDeadLetters(query map[string]string) (map[string]any, error) {
	pageNumber, err := outboxPositiveInteger(queryValue(query, "page"), 1)
	if err != nil {
		return nil, err
	}
	perPage, err := outboxPositiveInteger(queryValue(query, "perPage"), 20)
	if err != nil {
		return nil, err
	}
	perPage = min(perPage, 100)
	events, err := list(o.app, "outbox_events", `status="dead_letter"`, "-deadLetterAt,-created,id")
	if err != nil {
		return nil, err
	}
	items := []map[string]any{}
	start := (pageNumber - 1) * perPage
	for i := start; i < min(start+perPage, len(events)); i++ {
		items = append(items, deadLetterProjection(events[i]))
	}
	return map[string]any{
		"items": items, "page": pageNumber, "perPage": perPage, "totalItems": len(events),
		"totalPages": int(math.Ceil(float64(len(events)) / float64(perPage))),
	}, nil
}

func queryValue(query map[string]string, name string) any {
	if value, ok := query[name]; ok {
		return value
	}
	return jsx.Undefined{}
}

func dueFilter(now, staleBefore string) string {
	return `((status="pending" || status="failed") && (nextAttemptAt="" || nextAttemptAt<="` + filterTime(now) + `"))` +
		` || (status="processing" && processingStartedAt<="` + filterTime(staleBefore) + `")`
}

func validateOutboxEvent(event map[string]any) error {
	if id, _ := event["id"].(string); id == "" {
		return Fail("OUTBOX_EVENT_INVALID", "Outbox event requires an id", nil)
	}
	for _, name := range []string{"topic", "aggregateType", "aggregateId"} {
		if value, _ := event[name].(string); value == "" {
			return Fail("OUTBOX_EVENT_INVALID", "Outbox event requires topic and aggregate identity", nil)
		}
	}
	if attempts := jsx.Number(or(event["attempts"], 0)); !jsx.IsInteger(attempts) || attempts < 0 {
		return Fail("OUTBOX_ATTEMPTS_INVALID", "Outbox attempts must be a non-negative integer", nil)
	}
	return nil
}

func deliveryLimit(value any) (int, error) {
	limit := float64(outboxDefaultLimit)
	if _, undefined := value.(jsx.Undefined); !undefined {
		limit = jsx.Number(value)
	}
	if !jsx.IsInteger(limit) || limit <= 0 || limit > outboxMaxLimit {
		return 0, Fail("OUTBOX_LIMIT_INVALID", "Outbox limit must be between 1 and "+strconv.Itoa(outboxMaxLimit), nil)
	}
	return int(limit), nil
}

// outboxErrorCode keeps provider details out of storage: only a code-shaped value survives.
func outboxErrorCode(err error) string {
	code := strings.ToUpper(errorCode(err))
	if code == "" {
		code = "DELIVERY_FAILED"
	}
	if !safeCode.MatchString(code) {
		return "DELIVERY_FAILED"
	}
	return code
}

func deliverySummary(results []map[string]any) map[string]any {
	counts := map[string]int{}
	for _, result := range results {
		counts[result["status"].(string)]++
	}
	return map[string]any{"attempted": len(results), "deadLetter": counts["dead_letter"],
		"failed": counts["failed"], "sent": counts["sent"], "results": results}
}

// deadLetterProjection leaves the payload out of ops listings.
func deadLetterProjection(event map[string]any) map[string]any {
	code := event["lastErrorCode"]
	if !jsx.Truthy(code) {
		code = "DELIVERY_FAILED"
	}
	return map[string]any{
		"aggregateId": event["aggregateId"], "aggregateType": event["aggregateType"],
		"attempts": jsx.Number(or(event["attempts"], 0)), "created": event["created"],
		"deadLetterAt": event["deadLetterAt"], "id": event["id"], "lastErrorCode": code, "topic": event["topic"],
	}
}

func outboxPositiveInteger(value any, fallback int) (int, error) {
	number := float64(fallback)
	if _, undefined := value.(jsx.Undefined); !undefined && value != nil && value != "" {
		number = jsx.Number(value)
	}
	if !jsx.IsInteger(number) || number <= 0 {
		return 0, Fail("OUTBOX_CONFIGURATION_INVALID", "Outbox configuration values must be positive integers", nil)
	}
	return int(number), nil
}

// outboxRunner serializes delivery so the job and the manual route never claim the same events twice.
type outboxRunner struct {
	mu         sync.Mutex
	dispatcher Dispatcher
}

func (r *outboxRunner) deliver(app core.App, limit any) (map[string]any, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return newOutbox(app, r.dispatcher).deliverDue(limit)
}

// tick runs one scheduled delivery unless a run is already in flight.
func (r *outboxRunner) tick(app core.App) {
	if !r.mu.TryLock() {
		return
	}
	defer r.mu.Unlock()
	result, err := newOutbox(app, r.dispatcher).deliverDue(jsx.Undefined{})
	if err != nil {
		app.Logger().Error("course-credit outbox delivery failed", "error", err.Error())
		return
	}
	if result["failed"].(int) > 0 || result["deadLetter"].(int) > 0 {
		app.Logger().Warn("course-credit outbox delivery had failures",
			"attempted", result["attempted"], "failed", result["failed"], "deadLetter", result["deadLetter"])
	}
}

const defaultWebhookTimeout = 10000

var loopbackHosts = map[string]bool{"127.0.0.1": true, "::1": true, "[::1]": true, "localhost": true}

// WebhookDispatcher is CourseCreditWebhookDispatcher: an HMAC-signed JSON POST per event.
type WebhookDispatcher struct {
	url     string
	secret  string
	timeout time.Duration
	client  *http.Client
	clock   func() time.Time
}

// NewNotificationDispatcher is createCourseCreditNotificationDispatcher: no URL
// and no secret means delivery is off; anything else must be a complete, safe configuration.
func NewNotificationDispatcher(rawURL, secret, timeoutMs, nodeEnv string) (Dispatcher, error) {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" && secret == "" {
		return nil, nil
	}
	if rawURL == "" || secret == "" {
		return nil, Fail("OUTBOX_WEBHOOK_CONFIG_INCOMPLETE", "通知 webhook URL 与签名密钥必须同时配置", nil)
	}
	var timeout any = jsx.Undefined{}
	if timeoutMs != "" {
		timeout = timeoutMs
	}
	dispatcher, err := NewWebhookDispatcher(rawURL, secret, timeout, nodeEnv)
	if err != nil {
		return nil, err
	}
	return dispatcher, nil
}

func NewWebhookDispatcher(rawURL, secret string, timeoutMs any, nodeEnv string) (*WebhookDispatcher, error) {
	timeout, err := webhookTimeout(timeoutMs)
	if err != nil {
		return nil, err
	}
	target, err := validateWebhookURL(rawURL, nodeEnv)
	if err != nil {
		return nil, err
	}
	if jsx.Length(secret) < 16 {
		return nil, Fail("OUTBOX_WEBHOOK_SECRET_INVALID", "通知签名密钥至少需要 16 个字符", nil)
	}
	return &WebhookDispatcher{url: target, secret: secret, timeout: time.Duration(timeout) * time.Millisecond,
		client: &http.Client{}, clock: clock}, nil
}

func (d *WebhookDispatcher) Deliver(message OutboxMessage) error {
	if err := validateMessage(message); err != nil {
		return err
	}
	timestamp := iso(d.clock())
	body, err := webhookBody(message, timestamp)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), d.timeout)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, d.url, bytes.NewReader(body))
	if err != nil {
		return Fail("WEBHOOK_NETWORK_FAILED", "通知投递网络失败", nil)
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Idempotency-Key", message.IdempotencyKey)
	request.Header.Set("X-Kanyue-Event-Id", message.IdempotencyKey)
	request.Header.Set("X-Kanyue-Signature", signWebhook(string(body), timestamp, d.secret))
	request.Header.Set("X-Kanyue-Timestamp", timestamp)
	request.Header.Set("X-Kanyue-Topic", message.Topic)
	response, err := d.client.Do(request)
	if err != nil {
		if ctx.Err() != nil {
			return Fail("WEBHOOK_TIMEOUT", "通知投递超时", nil)
		}
		return Fail("WEBHOOK_NETWORK_FAILED", "通知投递网络失败", nil)
	}
	response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode > 299 {
		return Fail("WEBHOOK_HTTP_"+strconv.Itoa(response.StatusCode), "通知接收端拒绝了事件", nil)
	}
	return nil
}

// webhookBody is Hono's JSON.stringify of the envelope, in its key order and without HTML escaping.
func webhookBody(message OutboxMessage, timestamp string) ([]byte, error) {
	envelope := struct {
		EventID   string `json:"eventId"`
		Topic     string `json:"topic"`
		Aggregate struct {
			ID   string `json:"id"`
			Type string `json:"type"`
		} `json:"aggregate"`
		Payload    any    `json:"payload"`
		OccurredAt string `json:"occurredAt"`
		Version    int    `json:"version"`
	}{EventID: message.IdempotencyKey, Topic: message.Topic, Payload: message.Payload, OccurredAt: timestamp, Version: 1}
	envelope.Aggregate.ID, envelope.Aggregate.Type = message.AggregateID, message.AggregateType
	var buffer bytes.Buffer
	encoder := json.NewEncoder(&buffer)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(envelope); err != nil {
		return nil, err
	}
	return bytes.TrimSuffix(buffer.Bytes(), []byte("\n")), nil
}

func signWebhook(body, timestamp, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(timestamp + "." + body))
	return "sha256=" + hex.EncodeToString(mac.Sum(nil))
}

func validateWebhookURL(value, nodeEnv string) (string, error) {
	target, err := url.Parse(value)
	if err != nil || target.Scheme == "" || target.Host == "" {
		return "", Fail("OUTBOX_WEBHOOK_URL_INVALID", "通知 webhook URL 无效", nil)
	}
	host := strings.ToLower(target.Hostname())
	if target.Scheme != "https" && !(target.Scheme == "http" && loopbackHosts[host]) {
		return "", Fail("OUTBOX_WEBHOOK_URL_INSECURE", "通知 webhook 必须使用 HTTPS，只有本机回环地址可用 HTTP", nil)
	}
	if nodeEnv == "production" && target.Scheme != "https" {
		return "", Fail("OUTBOX_WEBHOOK_URL_INSECURE", "生产通知 webhook 必须使用 HTTPS", nil)
	}
	return target.String(), nil
}

func validateMessage(message OutboxMessage) error {
	for _, field := range []struct{ name, value string }{
		{"aggregateId", message.AggregateID}, {"aggregateType", message.AggregateType},
		{"idempotencyKey", message.IdempotencyKey}, {"topic", message.Topic},
	} {
		if field.value == "" {
			return Fail("OUTBOX_WEBHOOK_MESSAGE_INVALID", "通知事件缺少必要标识", map[string]any{"field": field.name})
		}
	}
	return nil
}

func webhookTimeout(value any) (int, error) {
	number := float64(defaultWebhookTimeout)
	if _, undefined := value.(jsx.Undefined); !undefined && value != "" {
		number = jsx.Number(value)
	}
	if !jsx.IsInteger(number) || number <= 0 {
		return 0, Fail("OUTBOX_WEBHOOK_TIMEOUT_INVALID", "通知超时时间必须是正整数", nil)
	}
	return int(number), nil
}
