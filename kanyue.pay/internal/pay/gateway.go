package pay

import (
	"regexp"
	"strings"
	"time"
)

// PaymentTTL closes unpaid payments; the channel receives the same deadline.
const PaymentTTL = 30 * time.Minute

func paymentExpired(payment Row, now time.Time) bool {
	created, ok := parseTime(str(payment.Data, "createdAt"))
	return str(payment.Data, "status") == "pending" && ok && now.Sub(created) >= PaymentTTL
}

// Service is what the HTTP layer and worker drive: the mock gateway or the WeChat gateway.
type Service interface {
	Core() *Gateway
	CreatePayment(input map[string]any, key string) (Row, error)
	ClosePayment(id string) (Row, error)
	CreateRefund(input map[string]any, key string) (Row, error)
	Observe(id string, input map[string]any) (Row, error)
	Poll() (PollResult, error)
	Action(payment Row) (map[string]any, error)
}

type PollResult struct {
	Inspected int         `json:"inspected"`
	Errors    []PollError `json:"errors"`
}

type PollError struct {
	ID   string `json:"id"`
	Code string `json:"code"`
}

// Gateway owns payment and refund state for one client. Channel is "wechatpay"
// for the WeChat gateway and empty for the generic mock provider.
type Gateway struct {
	Store   Store
	Owner   string
	Clock   func() string
	Channel string
}

func NewGateway(store Store, owner string) *Gateway {
	return &Gateway{Store: store, Owner: owner, Clock: nowISO}
}

func (g *Gateway) Core() *Gateway { return g }

var idPattern = regexp.MustCompile(`^[a-z0-9]{15}$`)

// Owned loads a row of kind that belongs to this client.
func (g *Gateway) Owned(id, kind string) (Row, error) {
	if !idPattern.MatchString(id) {
		return Row{}, fail("INVALID_ID", 400)
	}
	row, err := g.Store.Get(id)
	if err != nil {
		return Row{}, err
	}
	if row == nil || row.Kind != kind || row.Owner != g.Owner {
		return Row{}, fail("NOT_FOUND", 404)
	}
	return *row, nil
}

func (g *Gateway) CreatePayment(input map[string]any, key string) (Row, error) {
	reference, err := text(input["reference"], "REFERENCE")
	if err != nil {
		return Row{}, err
	}
	amount, err := minorUnits(input["amount"])
	if err != nil {
		return Row{}, err
	}
	if _, err := text(key, "IDEMPOTENCY_KEY"); err != nil {
		return Row{}, err
	}
	if input["currency"] != "CNY" {
		return Row{}, fail("UNSUPPORTED_CURRENCY", 400)
	}
	id := recordID("payment", g.Owner, reference)
	fingerprint := object{{"reference", reference}, {"amount", amount}, {"currency", "CNY"}, {"key", key}}
	channelData := map[string]any{}
	if g.Channel != "" {
		description, ok := input["description"].(string)
		if !ok || strings.TrimSpace(description) == "" || len(description) > 127 {
			return Row{}, fail("INVALID_DESCRIPTION", 400)
		}
		payerID, err := text(input["payerId"], "PAYER_ID")
		if err != nil {
			return Row{}, err
		}
		channelData = map[string]any{"channel": g.Channel, "payerId": payerID, "description": description}
		fingerprint = append(fingerprint, field{"channel", g.Channel}, field{"payerId", payerID}, field{"description", description})
	}
	hash := digest(fingerprint)
	return retry(func() (Row, error) {
		keyClaim, err := g.keyClaim("payment", key, id, hash)
		if err != nil {
			return Row{}, err
		}
		previous, err := g.Store.Get(id)
		if err != nil {
			return Row{}, err
		}
		if previous != nil {
			if str(previous.Data, "fingerprint") != hash {
				return Row{}, fail("IDEMPOTENCY_CONFLICT", 409)
			}
			if keyClaim != nil {
				if err := g.Store.Commit([]Mutation{insert(*keyClaim)}); err != nil {
					return Row{}, err
				}
			}
			return *previous, nil
		}
		data := map[string]any{"reference": reference, "amount": amount, "currency": "CNY", "status": "pending",
			"refunded": 0, "reserved": 0, "fingerprint": hash, "createdAt": g.Clock()}
		for key, value := range channelData {
			data[key] = value
		}
		payment := g.fresh(id, "payment", data)
		changes := []Mutation{insert(payment), insert(g.provider(payment, "payment", amount))}
		if keyClaim != nil {
			changes = append(changes, insert(*keyClaim))
		}
		return payment, g.Store.Commit(changes)
	})
}

func (g *Gateway) ClosePayment(id string) (Row, error) {
	return retry(func() (Row, error) {
		payment, err := g.Owned(id, "payment")
		if err != nil {
			return Row{}, err
		}
		switch str(payment.Data, "status") {
		case "closed":
			return payment, nil
		case "pending":
		default:
			return Row{}, fail("PAYMENT_NOT_CLOSABLE", 409)
		}
		provider, err := g.Owned(recordID("provider", id), "provider")
		if err != nil {
			return Row{}, err
		}
		if str(provider.Data, "status") == "succeeded" {
			return Row{}, fail("PAYMENT_ALREADY_CAPTURED", 409)
		}
		changed := next(payment, map[string]any{"status": "closed"})
		return changed, g.Store.Commit([]Mutation{update(changed),
			update(next(provider, map[string]any{"status": "closed", "observedAt": g.Clock(), "applied": true})),
			insert(g.event(changed, "payment.closed"))})
	})
}

func (g *Gateway) CreateRefund(input map[string]any, key string) (Row, error) {
	paymentID, err := text(input["paymentId"], "PAYMENT_ID")
	if err != nil {
		return Row{}, err
	}
	reference, err := text(input["reference"], "REFERENCE")
	if err != nil {
		return Row{}, err
	}
	amount, err := minorUnits(input["amount"])
	if err != nil {
		return Row{}, err
	}
	if _, err := text(key, "IDEMPOTENCY_KEY"); err != nil {
		return Row{}, err
	}
	id := recordID("refund", g.Owner, reference)
	hash := digest(object{{"paymentId", paymentID}, {"reference", reference}, {"amount", amount}, {"key", key}})
	return retry(func() (Row, error) {
		keyClaim, err := g.keyClaim("refund", key, id, hash)
		if err != nil {
			return Row{}, err
		}
		previous, err := g.Store.Get(id)
		if err != nil {
			return Row{}, err
		}
		if previous != nil {
			if str(previous.Data, "fingerprint") != hash {
				return Row{}, fail("IDEMPOTENCY_CONFLICT", 409)
			}
			if keyClaim != nil {
				if err := g.Store.Commit([]Mutation{insert(*keyClaim)}); err != nil {
					return Row{}, err
				}
			}
			return *previous, nil
		}
		payment, err := g.Owned(paymentID, "payment")
		if err != nil {
			return Row{}, err
		}
		if str(payment.Data, "status") != "succeeded" {
			return Row{}, fail("PAYMENT_NOT_CAPTURED", 409)
		}
		if num(payment.Data, "amount")-num(payment.Data, "refunded")-num(payment.Data, "reserved") < amount {
			return Row{}, fail("REFUND_EXCEEDS_AVAILABLE", 409)
		}
		refund := g.fresh(id, "refund", map[string]any{"paymentId": paymentID, "reference": reference, "amount": amount,
			"status": "processing", "fingerprint": hash, "createdAt": g.Clock()})
		changes := []Mutation{insert(refund), insert(g.provider(refund, "refund", amount))}
		if keyClaim != nil {
			changes = append(changes, insert(*keyClaim))
		}
		changes = append(changes, update(next(payment, map[string]any{"reserved": num(payment.Data, "reserved") + amount})),
			insert(g.event(refund, "refund.processing")))
		return refund, g.Store.Commit(changes)
	})
}

// Observe records a provider result for the mock provider; Poll applies it.
func (g *Gateway) Observe(targetID string, input map[string]any) (Row, error) {
	status, _ := input["status"].(string)
	if status != "succeeded" && status != "failed" {
		return Row{}, fail("INVALID_PROVIDER_STATUS", 400)
	}
	return retry(func() (Row, error) {
		row, err := g.Owned(recordID("provider", targetID), "provider")
		if err != nil {
			return Row{}, err
		}
		current := str(row.Data, "status")
		if str(row.Data, "targetKind") == "refund" && current == "failed" && status != "failed" {
			return Row{}, fail("REFUND_FAILURE_IS_FINAL", 409)
		}
		if current == "succeeded" && status != "succeeded" {
			return Row{}, fail("CAPTURE_IS_IMMUTABLE", 409)
		}
		amount := num(row.Data, "amount")
		if value, present := input["amount"]; present {
			if amount, err = minorUnits(value); err != nil {
				return Row{}, err
			}
		}
		if current == status && num(row.Data, "amount") == amount {
			return row, nil
		}
		if current == "succeeded" {
			return Row{}, fail("CAPTURE_IS_IMMUTABLE", 409)
		}
		changed := next(row, map[string]any{"status": status, "amount": amount, "observedAt": g.Clock(), "applied": false})
		return changed, g.Store.Commit([]Mutation{update(changed)})
	})
}

// Poll derives open work from durable state: expired pending payments and
// provider results not yet applied. Nothing is queued in memory.
func (g *Gateway) Poll() (PollResult, error) {
	result := PollResult{Errors: []PollError{}}
	payments, err := g.Store.List("payment", g.Owner, Where{"status": "pending"})
	if err != nil {
		return result, err
	}
	for _, payment := range payments {
		if str(payment.Data, "channel") != "" || !paymentExpired(payment, time.Now()) {
			continue
		}
		if _, err := g.ClosePayment(payment.ID); err != nil {
			result.Errors = append(result.Errors, PollError{payment.ID, codeOr(err, "PAYMENT_CLOSE_FAILED")})
		}
	}
	observations, err := g.Store.List("provider", g.Owner, Where{"applied": Not{true}, "status": Not{"pending"}})
	if err != nil {
		return result, err
	}
	for _, observation := range observations {
		if status := str(observation.Data, "status"); status != "succeeded" && status != "failed" {
			continue
		}
		if err := retryErr(func() error { return g.accept(observation.ID) }); err != nil {
			result.Errors = append(result.Errors, PollError{str(observation.Data, "targetId"), codeOr(err, "PROVIDER_SYNC_FAILED")})
		}
	}
	result.Inspected = len(observations)
	return result, nil
}

func codeOr(err error, fallback string) string {
	if code := codeOf(err); code != "" {
		return code
	}
	return fallback
}

// accept applies one provider result; marking it applied in the same commit keeps polling bounded.
func (g *Gateway) accept(providerID string) error {
	observation, err := g.Owned(providerID, "provider")
	if err != nil {
		return err
	}
	targetID, status, amount := str(observation.Data, "targetId"), str(observation.Data, "status"), num(observation.Data, "amount")
	applied := update(next(observation, map[string]any{"applied": true}))
	if str(observation.Data, "targetKind") == "payment" {
		row, err := g.Owned(targetID, "payment")
		if err != nil {
			return err
		}
		current := str(row.Data, "status")
		if current == "succeeded" || current == status {
			return g.Store.Commit([]Mutation{applied})
		}
		if amount != num(row.Data, "amount") {
			return fail("PROVIDER_AMOUNT_MISMATCH", 409)
		}
		succeeded := status == "succeeded"
		patch := map[string]any{"status": "failed"}
		if succeeded {
			patch = map[string]any{"status": "succeeded", "paidAt": observation.Data["observedAt"], "late": current != "pending"}
		} else if status == "closed" {
			patch["status"] = "closed"
		}
		changed := next(row, patch)
		changes := []Mutation{applied, update(changed), insert(g.event(changed, "payment."+str(changed.Data, "status")))}
		if succeeded && flag(changed.Data, "late") {
			changes = append(changes, insert(g.fresh(recordID("late", row.ID), "reconciliation", map[string]any{
				"targetId": row.ID, "reason": "LATE_PAYMENT_SUCCESS", "occurredAt": g.Clock()})))
		}
		return g.Store.Commit(changes)
	}
	row, err := g.Owned(targetID, "refund")
	if err != nil {
		return err
	}
	if str(row.Data, "status") != "processing" {
		return g.Store.Commit([]Mutation{applied})
	}
	if amount != num(row.Data, "amount") {
		return fail("PROVIDER_AMOUNT_MISMATCH", 409)
	}
	payment, err := g.Owned(str(row.Data, "paymentId"), "payment")
	if err != nil {
		return err
	}
	if num(payment.Data, "reserved") < amount {
		return fail("REFUND_RESERVATION_MISMATCH", 409)
	}
	refunded := num(payment.Data, "refunded")
	final := "failed"
	if status == "succeeded" {
		final, refunded = "succeeded", refunded+amount
	}
	changed := next(row, map[string]any{"status": final})
	return g.Store.Commit([]Mutation{applied, update(changed),
		update(next(payment, map[string]any{"reserved": num(payment.Data, "reserved") - amount, "refunded": refunded})),
		insert(g.event(changed, "refund."+final))})
}

// Events is the unacknowledged feed, at most 100 per call.
func (g *Gateway) Events() ([]Row, error) {
	rows, err := g.Store.List("event", g.Owner, Where{"acknowledged": false})
	if len(rows) > 100 {
		rows = rows[:100]
	}
	return rows, err
}

func (g *Gateway) Acknowledge(id string) error {
	return retryErr(func() error {
		row, err := g.Owned(id, "event")
		if err != nil || flag(row.Data, "acknowledged") {
			return err
		}
		return g.Store.Commit([]Mutation{update(next(row, map[string]any{"acknowledged": true}))})
	})
}

// Action is how the client launches payment; the generic provider has only a mock action.
func (g *Gateway) Action(payment Row) (map[string]any, error) {
	return map[string]any{"type": "mock", "paymentId": payment.ID}, nil
}

func (g *Gateway) fresh(id, kind string, data map[string]any) Row {
	return fresh(id, kind, g.Owner, data)
}

func (g *Gateway) keyClaim(kind, key, targetID, hash string) (*Row, error) {
	id := recordID("idempotency", g.Owner, kind, key)
	previous, err := g.Store.Get(id)
	if err != nil {
		return nil, err
	}
	if previous != nil {
		if str(previous.Data, "fingerprint") != hash {
			return nil, fail("IDEMPOTENCY_CONFLICT", 409)
		}
		return nil, nil
	}
	row := g.fresh(id, "idempotency", map[string]any{"targetId": targetID, "fingerprint": hash})
	return &row, nil
}

func (g *Gateway) provider(row Row, targetKind string, amount int) Row {
	return g.fresh(recordID("provider", row.ID), "provider", map[string]any{
		"targetId": row.ID, "targetKind": targetKind, "amount": amount, "status": "pending", "observedAt": g.Clock()})
}

func (g *Gateway) event(row Row, kind string) Row {
	return g.fresh(recordID("event", row.ID, row.Version, kind), "event", map[string]any{
		"type": kind, "targetId": row.ID, "payload": row.Data, "occurredAt": g.Clock(), "acknowledged": false})
}
