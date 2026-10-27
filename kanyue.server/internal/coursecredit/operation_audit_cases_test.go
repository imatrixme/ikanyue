package coursecredit

import (
	"reflect"
	"strings"
	"testing"
	"time"
)

// Operation audit cases ported from Hono's courseCreditOperationAudit tests.

// Hono: courseCreditOperationAudit › operation audit removes sensitive fields and bounds persisted summaries
func TestOperationAuditRemovesSensitiveFields(t *testing.T) {
	summary := privacySafeSummary(map[string]any{
		"cellphone": "13800000000", "displayName": "private", "accessToken": "private",
		"safe":    strings.Repeat("x", maxSummaryText+10),
		"batches": []any{map[string]any{"id": "one"}, map[string]any{"id": "two"}},
		"nested": map[string]any{"email": "private@example.com", "status": "active",
			"child": map[string]any{"code": "kept", "payload": map[string]any{"private": true}}},
	}, 0)
	for _, key := range []string{"cellphone", "displayName", "accessToken"} {
		if _, ok := summary[key]; ok {
			t.Fatalf("%s kept: %v", key, summary)
		}
	}
	if len(summary["safe"].(string)) != maxSummaryText || summary["batchesCount"] != 2 ||
		!reflect.DeepEqual(summary["nested"], map[string]any{"status": "active", "child": map[string]any{"code": "kept"}}) {
		t.Fatalf("summary = %v", summary)
	}
	if len(privacySafeSummary(nil, 0)) != 0 || len(privacySafeSummary("not-an-object", 0)) != 0 {
		t.Fatal("non-object summaries must be empty")
	}
}

// Hono: courseCreditOperationAudit › operation audit normalizes reason, outcome, and empty summaries
func TestOperationAuditNormalizesReason(t *testing.T) {
	if audit := operationAudit(nil, nil, nil); !reflect.DeepEqual(audit, map[string]any{"reason": "business_command",
		"outcome": "committed", "beforeSummary": map[string]any{}, "afterSummary": map[string]any{}}) {
		t.Fatalf("audit = %v", audit)
	}
	if audit := operationAudit("  "+strings.Repeat("r", maxSummaryText+5)+"  ", nil, nil); len(audit["reason"].(string)) != maxSummaryText {
		t.Fatalf("reason = %v", audit["reason"])
	}
}

// Hono: courseCreditOperationAudit › teaching commands persist traceable privacy-safe audit metadata
func TestTeachingOperationAuditMetadata(t *testing.T) {
	at := time.Date(2026, 7, 17, 10, 0, 0, 0, time.UTC)
	operation := teaching{operationID: "operation", scopedKey: "settle:key", requestHash: "hash", at: iso(at)}.operation(
		map[string]any{"actorId": "admin", "actorRole": "admin", "traceId": "trace", "reason": "lesson complete"},
		"settle_session", "session", "session", nil,
		map[string]any{"participantIds": []any{"one", "two"}, "phone": "private"},
		map[string]any{"settledCount": 2, "metadata": map[string]any{"private": true}}).data
	if operation["id"] != "operation" || operation["traceId"] != "trace" || operation["reason"] != "lesson complete" ||
		operation["outcome"] != "committed" ||
		!reflect.DeepEqual(operation["beforeSummary"], map[string]any{"participantIdsCount": 2}) ||
		!reflect.DeepEqual(operation["afterSummary"], map[string]any{"settledCount": 2}) {
		t.Fatalf("operation = %v", operation)
	}
}

// Hono: courseCreditOperationAudit › reservation commands use the same audit contract
func TestReservationOperationAuditContract(t *testing.T) {
	operation := teaching{operationID: "operation", scopedKey: "reserve:key", requestHash: "hash", at: "2026-07-17T10:00:00.000Z"}.operation(
		map[string]any{"actorId": "student", "actorRole": "student", "traceId": "trace"},
		"reserve", "session_student", "session-student", "student",
		map[string]any{"creditStatus": "eligible", "sessionStudentId": "session-student"},
		map[string]any{"operationId": "operation", "allocations": []any{map[string]any{"id": "allocation"}}}).data
	if operation["traceId"] != "trace" || operation["reason"] != "reserve" ||
		!reflect.DeepEqual(operation["beforeSummary"], map[string]any{"creditStatus": "eligible", "sessionStudentId": "session-student"}) ||
		!reflect.DeepEqual(operation["afterSummary"], map[string]any{"operationId": "operation", "allocationsCount": 1}) {
		t.Fatalf("operation = %v", operation)
	}
}
