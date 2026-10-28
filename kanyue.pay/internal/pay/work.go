package pay

import (
	"bytes"
	"errors"
	"net/http"
	"strings"
	"time"

	"kanyue.pay/internal/gatewaylink"
)

// DurableWork leases retryable channel work in rows, so backoff and exhaustion survive restarts.
type DurableWork struct {
	Store       Store
	Owner       string
	Clock       func() int64
	MaxAttempts int
}

func NewDurableWork(store Store, owner string) *DurableWork {
	return &DurableWork{Store: store, Owner: owner, Clock: func() int64 { return time.Now().UnixMilli() }, MaxAttempts: 12}
}

type WorkResult struct {
	Skipped bool
	Done    bool
	Error   string
}

func (w *DurableWork) exhausted(id, targetID string, version int) Mutation {
	return insert(fresh(recordID("work-exhausted", id, version), "reconciliation", w.Owner, map[string]any{
		"targetId": targetID, "reason": "RETRY_EXHAUSTED", "occurredAt": iso(time.UnixMilli(w.Clock()))}))
}

func (w *DurableWork) Run(task, targetID string, action func() (bool, error)) (WorkResult, error) {
	id := recordID("work", w.Owner, task, targetID)
	claimed, err := retry(func() (*Row, error) {
		row, err := w.Store.Get(id)
		if err != nil {
			return nil, err
		}
		if row == nil {
			created := fresh(id, "work", w.Owner, map[string]any{"task": task, "targetId": targetID, "attempts": 0,
				"nextAt": 0, "exhausted": false, "done": false})
			if err := w.Store.Commit([]Mutation{insert(created)}); err != nil {
				return nil, err
			}
			row = &created
		}
		if flag(row.Data, "done") || flag(row.Data, "exhausted") || int64(num(row.Data, "nextAt")) > w.Clock() {
			return nil, nil
		}
		if num(row.Data, "attempts") >= w.MaxAttempts {
			return nil, w.Store.Commit([]Mutation{update(next(*row, map[string]any{"exhausted": true})),
				w.exhausted(id, targetID, row.Version)})
		}
		// The lease survives process loss; only this version can complete the attempt.
		claimed := next(*row, map[string]any{"nextAt": w.Clock() + 60000, "attempts": num(row.Data, "attempts") + 1})
		return &claimed, w.Store.Commit([]Mutation{update(claimed)})
	})
	if err != nil {
		return WorkResult{}, err
	}
	if claimed == nil {
		return WorkResult{Skipped: true}, nil
	}
	done, actionErr := action()
	if actionErr == nil {
		return WorkResult{Done: done}, w.Store.Commit([]Mutation{update(next(*claimed, map[string]any{
			"done": done, "attempts": 0, "nextAt": w.Clock() + 5000, "lastError": nil}))})
	}
	code := codeOr(actionErr, "WORK_UNRESOLVED")
	attempts := num(claimed.Data, "attempts")
	exhausted := attempts >= w.MaxAttempts
	backoff := int64(1000) << min(attempts, 8)
	changes := []Mutation{update(next(*claimed, map[string]any{"exhausted": exhausted, "lastError": code,
		"nextAt": w.Clock() + min(300000, backoff)}))}
	if exhausted {
		changes = append(changes, w.exhausted(id, targetID, claimed.Version))
	}
	return WorkResult{Error: code}, w.Store.Commit(changes)
}

// Reset resumes exhausted work with an audited operator reason.
func (w *DurableWork) Reset(id, actorID, reason string) error {
	if actorID == "" || len([]rune(strings.TrimSpace(reason))) < 2 || len([]rune(reason)) > 500 {
		return fail("RETRY_REASON_REQUIRED", 400)
	}
	return retryErr(func() error {
		row, err := w.Store.Get(id)
		if err != nil {
			return err
		}
		if row == nil || row.Kind != "work" || row.Owner != w.Owner {
			return fail("NOT_FOUND", 404)
		}
		if !flag(row.Data, "exhausted") {
			return fail("WORK_NOT_EXHAUSTED", 409)
		}
		return w.Store.Commit([]Mutation{update(next(*row, map[string]any{"attempts": 0, "exhausted": false, "nextAt": 0})),
			insert(fresh(recordID("retry-audit", id, row.Version), "audit", w.Owner, map[string]any{
				"action": "retry_resumed", "targetId": row.Data["targetId"], "actorId": actorID, "reason": reason, "at": w.Clock()}))})
	})
}

type EventTarget struct {
	URL   string
	Token string
}

type Transport func(*http.Request) (*http.Response, error)

var noRedirects = &http.Client{Timeout: 10 * time.Second,
	CheckRedirect: func(*http.Request, []*http.Request) error { return errors.New("redirect forbidden") }}

// DefaultTransport sends with a 10s timeout and refuses redirects.
func DefaultTransport(request *http.Request) (*http.Response, error) { return noRedirects.Do(request) }

// Tracked is DefaultTransport with its calls reported to kanyue.gateway as outbound calls to target.
func Tracked(target string) Transport {
	client := &http.Client{Timeout: noRedirects.Timeout, CheckRedirect: noRedirects.CheckRedirect, Transport: gatewaylink.Track(target, nil)}
	return client.Do
}

// paymentCallbacks deliver payment events to kanyue.server; wechatPay reaches the WeChat Pay API.
var paymentCallbacks, wechatPay = Tracked("payment-callback"), Tracked("wechat-pay")

// DeliverEvents pushes unacknowledged events; only HTTP 204 acknowledges one.
func DeliverEvents(g *Gateway, work *DurableWork, target *EventTarget, transport Transport) error {
	if target == nil {
		return nil
	}
	rows, err := g.Events()
	if err != nil {
		return err
	}
	for _, row := range rows {
		_, err := work.Run("event-delivery", row.ID, func() (bool, error) {
			// Payer identifiers and launch credentials never leave the gateway.
			payload := mapOf(row.Data["payload"])
			body := jsonBytes(map[string]any{"id": row.ID, "type": row.Data["type"], "targetId": row.Data["targetId"],
				"reference": payload["reference"], "amount": payload["amount"], "status": payload["status"]})
			request, err := http.NewRequest(http.MethodPost, target.URL, bytes.NewReader(body))
			if err != nil {
				return false, err
			}
			request.Header.Set("Authorization", "Bearer "+target.Token)
			request.Header.Set("Content-Type", "application/json")
			response, err := transport(request)
			if err != nil {
				return false, err
			}
			response.Body.Close()
			if response.StatusCode != http.StatusNoContent {
				return false, fail("EVENT_NOT_ACKNOWLEDGED", 503)
			}
			return true, g.Acknowledge(row.ID)
		})
		if err != nil {
			return err
		}
	}
	return nil
}
