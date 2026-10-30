package payment

import (
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/coursecredit"
	"kanyue.server/internal/jsx"
)

// Paying refund requests back through the gateway. Each attempt is one refund
// transaction with its own reference; the order center books the result.

// syncRefund sends a refund request to the gateway or reads back its result.
func (s *service) syncRefund(refundID string) error {
	refund, err := coursecredit.RefundOf(s.app, refundID)
	if err != nil {
		return err
	}
	record, err := latestRefund(s.app, refundID)
	if err != nil {
		return err
	}
	if refund.Status != "processing" || refund.Settlement != "online" {
		// The order center booked a result the transaction has not caught up with.
		if record != nil && record.GetString("status") == "processing" && refund.Status != "processing" {
			return s.mark(record, refund.Status)
		}
		return nil
	}
	// A transaction is finished only after the order center booked it, so a
	// processing request with a finished attempt was reopened for a retry.
	if record == nil || record.GetString("status") != "processing" {
		payment, err := paymentOf(s.app, refund.OrderID)
		if err != nil {
			return err
		}
		if payment == nil || payment.GetString("gatewayId") == "" {
			return coursecredit.Fail("REFUND_NOT_READY", "订单付款记录需要核对", nil)
		}
		attempt, reference := 0.0, refundID
		if record != nil {
			attempt = record.GetFloat("attempt") + 1
			reference = hashID("refund-retry", refundID, attempt)
		}
		record, err = insert(s.app, refunds, hashID("refund-transaction", refundID, attempt), map[string]any{"refundId": refundID,
			"orderId": refund.OrderID, "paymentId": payment.GetString("gatewayId"), "reference": reference,
			"amountMinor": refund.Amount, "attempt": attempt, "status": "processing", "version": 1})
		if err != nil {
			return err
		}
	}
	var result map[string]any
	if record.GetString("gatewayId") == "" {
		if result, err = s.gateway.refund(record.GetString("reference"), record.GetString("paymentId"), record.GetFloat("amountMinor")); err != nil {
			return err
		}
		if err := change(s.app, record, map[string]any{"gatewayId": result["id"]}); err != nil {
			return err
		}
	} else if result, err = s.gateway.refundStatus(record.GetString("gatewayId")); err != nil {
		return err
	}
	if result["reference"] != record.GetString("reference") || result["amount"] != record.GetFloat("amountMinor") ||
		result["paymentId"] != record.GetString("paymentId") {
		return coursecredit.Fail("REFUND_RECEIPT_MISMATCH", "退款结果需要核对", nil)
	}
	switch result["status"] {
	case "succeeded":
		if err := coursecredit.RefundSucceeded(s.app, refundID, jsx.String(result["id"])); err != nil {
			return err
		}
		return s.mark(record, "succeeded")
	case "failed":
		if err := coursecredit.RefundFailed(s.app, refundID, jsx.String(result["id"])); err != nil {
			return err
		}
		return s.mark(record, "failed")
	}
	return nil
}

// recoverRefunds retries refunds still owed online, then acknowledges refund events already reflected locally.
func (s *service) recoverRefunds() (map[string]any, error) {
	due, err := coursecredit.OnlineRefunds(s.app, "processing")
	if err != nil {
		return nil, err
	}
	ids := []string{}
	for _, refund := range due {
		ids = append(ids, refund.ID)
	}
	// Attempts whose result the order center booked before a crash.
	open, err := s.app.FindRecordsByFilter(refunds, `status="processing"`, "created", 0, 0)
	if err != nil {
		return nil, err
	}
	for _, record := range open {
		ids = append(ids, record.GetString("refundId"))
	}
	seen, failed := map[string]bool{}, 0
	for _, id := range ids {
		if seen[id] {
			continue
		}
		seen[id] = true
		if s.syncRefund(id) != nil {
			failed++
		}
	}
	events, err := s.gatewayEvents("refund.")
	if err != nil {
		return nil, err
	}
	for _, event := range events {
		data := asMap(event["data"])
		row, err := s.refundByReference(jsx.String(asMap(data["payload"])["reference"]))
		if err != nil {
			return nil, err
		}
		if row == nil || (row.GetString("gatewayId") == data["targetId"] && row.GetString("status") != "processing") {
			if err := s.ack(event); err != nil {
				return nil, err
			}
		}
	}
	return map[string]any{"inspected": len(seen), "unresolved": failed}, nil
}

func (s *service) refundByReference(reference string) (*core.Record, error) {
	return first(s.app, refunds, "reference={:reference}", "", dbx.Params{"reference": reference})
}

// retry reopens a failed reservation refund and sends it again under a new reference.
func (s *service) retry(refundID string, actor map[string]any) (map[string]any, error) {
	if err := coursecredit.ReopenRefund(s.app, refundID, actor); err != nil {
		return nil, err
	}
	if err := s.syncRefund(refundID); err != nil {
		return nil, err
	}
	return coursecredit.RefundView(s.app, refundID)
}

// mockRefund makes the mock channel pay a refund out.
func (s *service) mockRefund(refundID string) (map[string]any, error) {
	if err := s.syncRefund(refundID); err != nil {
		return nil, err
	}
	refund, err := coursecredit.RefundOf(s.app, refundID)
	if err != nil {
		return nil, err
	}
	record, err := latestRefund(s.app, refundID)
	if err != nil {
		return nil, err
	}
	if refund.Status != "processing" || record == nil || record.GetString("gatewayId") == "" {
		return nil, coursecredit.Fail("REFUND_NOT_READY", "该退款当前不能模拟到账", nil)
	}
	if err := s.gateway.mockSuccess(record.GetString("gatewayId")); err != nil {
		return nil, err
	}
	if err := s.syncRefund(refundID); err != nil {
		return nil, err
	}
	return coursecredit.RefundView(s.app, refundID)
}
