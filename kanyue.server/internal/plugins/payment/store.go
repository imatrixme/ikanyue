package payment

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strconv"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/jsx"
)

// The plugin's own records: payment and refund transactions, money cases, the
// version claims guarding them and its audit. Order facts come only through
// coursecredit's order center commands.

const (
	payments = "payment_transactions"
	refunds  = "refund_transactions"
	cases    = "payment_cases"
	claims   = "payment_claims"
	audit    = "payment_audit"
)

// hashID names a plugin row after what it stands for, so a retry finds it.
func hashID(parts ...any) string {
	raw, _ := json.Marshal(parts)
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:])[:15]
}

// first is the first record matching filter, or nil.
func first(app core.App, collection, filter, sort string, params dbx.Params) (*core.Record, error) {
	items, err := app.FindRecordsByFilter(collection, filter, sort, 1, 0, params)
	if err != nil || len(items) == 0 {
		return nil, err
	}
	return items[0], nil
}

// paymentOf is the order's payment transaction, or nil before the cashier opened.
func paymentOf(app core.App, orderID string) (*core.Record, error) {
	return first(app, payments, "orderId={:id}", "", dbx.Params{"id": orderID})
}

// latestRefund is the refund request's latest channel attempt, or nil before the first.
func latestRefund(app core.App, refundID string) (*core.Record, error) {
	return first(app, refunds, "refundId={:id}", "-attempt", dbx.Params{"id": refundID})
}

// insert creates a plugin row with a known id; an existing row with that id is returned instead.
func insert(app core.App, collection, id string, fields map[string]any) (*core.Record, error) {
	if found, err := app.FindRecordById(collection, id); err == nil {
		return found, nil
	} else if !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}
	target, err := app.FindCachedCollectionByNameOrId(collection)
	if err != nil {
		return nil, err
	}
	record := core.NewRecord(target)
	record.Id = id
	record.Load(fields)
	if err := app.Save(record); err != nil {
		// A concurrent writer created it first.
		if found, findErr := app.FindRecordById(collection, id); findErr == nil {
			return found, nil
		}
		return nil, err
	}
	return record, nil
}

// change claims record's version in payment_claims before saving changes, so a
// writer holding a stale copy fails instead of overwriting.
func change(app core.App, record *core.Record, changes map[string]any) error {
	version := record.GetFloat("version")
	return app.RunInTransaction(func(tx core.App) error {
		target, err := tx.FindCachedCollectionByNameOrId(claims)
		if err != nil {
			return err
		}
		claim := core.NewRecord(target)
		claim.Set("key", record.Collection().Name+":"+record.Id+":"+strconv.FormatFloat(version, 'f', -1, 64))
		if err := tx.Save(claim); err != nil {
			return err
		}
		record.Load(changes)
		record.Set("version", version+1)
		return tx.Save(record)
	})
}

// note records a finance action in the plugin's audit.
func note(app core.App, id, subjectID, actorID, action string, data map[string]any) error {
	_, err := insert(app, audit, id, map[string]any{"subjectId": subjectID, "actorId": actorID, "action": action, "data": data})
	return err
}

func asMap(value any) map[string]any {
	result, _ := value.(map[string]any)
	return result
}

func anyList(value any) []any {
	items, _ := value.([]any)
	return items
}

// or is JavaScript's `value || fallback`.
func or(value, fallback any) any {
	if jsx.Truthy(value) {
		return value
	}
	return fallback
}
