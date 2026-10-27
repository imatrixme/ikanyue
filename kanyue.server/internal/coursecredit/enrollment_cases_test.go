package coursecredit

import (
	"errors"
	"strings"
	"testing"
	"time"

	"kanyue.server/internal/jsx"
	"kanyue.server/internal/testkit"
)

// Enrollment cases ported from Hono's courseCreditAutomaticEnrollment tests,
// run against stored records instead of Hono's mock repository.

var enrollmentNow = time.Date(2026, 7, 23, 8, 0, 0, 0, time.UTC)

func (f ledgerFixture) enrollment(changes map[string]any) map[string]any {
	return with2(map[string]any{"studentId": f.studentID, "packageId": f.packageID, "priceVersionId": f.priceID,
		"classId": f.classID, "channel": "admin", "paymentReference": "cash-1", "reason": "线下报名"}, changes)
}

func (f ledgerFixture) enroll(t *testing.T, values map[string]any, actor Actor) (map[string]any, error) {
	t.Helper()
	return enroll(f.app, bodyOf(values), actor, enrollmentNow)
}

// enrollmentSetup moves the fixture lesson after enrollmentNow so it counts as a future lesson.
func enrollmentSetup(t *testing.T) ledgerFixture {
	t.Helper()
	f := ledgerSetup(t, true)
	patch(t, f.app, "sessions", f.sessionID, map[string]any{"startAt": "2026-07-30 08:00:00.000Z", "endAt": "2026-07-30 09:00:00.000Z"})
	return f
}

func (f ledgerFixture) first(t *testing.T, collection, filter string) map[string]any {
	t.Helper()
	record, err := findFirst(f.app, collection, filter)
	if err != nil || record == nil {
		t.Fatalf("%s %s: %v", collection, filter, err)
	}
	return record
}

// Hono: courseCreditAutomaticEnrollment › automatic enrollment atomically creates order, payment, grants, membership, audit, and sync outbox
func TestEnrollmentCreatesEveryRecord(t *testing.T) {
	f := enrollmentSetup(t)
	result, err := f.enroll(t, f.enrollment(nil), f.admin(t))
	if err != nil {
		t.Fatal(err)
	}
	sync := result["sync"].(map[string]any)
	if result["status"] != "synchronizing_future_lessons" || sync["requiresConfirmation"] != true || sync["futureLessonCount"] != 1 ||
		len(result["grants"].([]any)) != 1 || result["replayed"] != false {
		t.Fatalf("result = %v", result)
	}
	orderID := result["orderId"].(string)
	order := f.first(t, "orders", `id="`+orderID+`"`)
	if order["status"] != "granted" || order["productSnapshot"].(map[string]any)["classId"] != f.classID {
		t.Fatalf("order = %v", order)
	}
	if member := f.first(t, "class_students", `studentId="`+f.studentID+`"`); member["sourceOrderId"] != orderID {
		t.Fatalf("membership = %v", member)
	}
	if event := f.first(t, "outbox_events", `aggregateId="`+orderID+`"`); event["topic"] != "course-enrollment.activated" {
		t.Fatalf("outbox = %v", event)
	}
	for _, collection := range []string{"payment_events", "credit_operations", "credit_batches", "credit_events", "ops_audit_logs"} {
		if f.count(t, collection, "") == 0 {
			t.Fatalf("%s not written", collection)
		}
	}
	if f.count(t, "session_students", "") != 0 {
		t.Fatal("enrollment must not add the student to lessons before sync is confirmed")
	}
}

// Hono: courseCreditAutomaticEnrollment › enrollment without class completes as awaiting assignment and uses configured package values
func TestEnrollmentWithoutClassAwaitsAssignment(t *testing.T) {
	f := enrollmentSetup(t)
	result, err := f.enroll(t, f.enrollment(map[string]any{"classId": "", "paidAmount": 2600.0}), f.admin(t))
	if err != nil {
		t.Fatal(err)
	}
	if result["status"] != "awaiting_class_assignment" || result["classId"] != nil ||
		result["sync"].(map[string]any)["status"] != "not_required" || f.count(t, "class_students", "") != 0 {
		t.Fatalf("result = %v", result)
	}
	order := f.first(t, "orders", `id="`+result["orderId"].(string)+`"`)
	line := order["grantSnapshot"].(map[string]any)["lines"].([]any)[0].(map[string]any)
	if order["paidAmount"] != 2600.0 || order["channel"] != "admin" || line["paidUnitCost"] != 260.0 {
		t.Fatalf("order = %v", order)
	}
}

// Hono: courseCreditAutomaticEnrollment › enrollment replays immutable results and rejects conflicting duplicate keys
func TestEnrollmentReplaysAndRejectsConflicts(t *testing.T) {
	f := enrollmentSetup(t)
	first, err := f.enroll(t, f.enrollment(nil), f.admin(t))
	if err != nil {
		t.Fatal(err)
	}
	replayed, err := f.enroll(t, f.enrollment(nil), f.admin(t))
	if err != nil || replayed["replayed"] != true || replayed["orderId"] != first["orderId"] {
		t.Fatalf("replay = %v, %v", replayed, err)
	}
	if f.count(t, "orders", "") != 1 {
		t.Fatal("replay created another order")
	}
	_, err = f.enroll(t, f.enrollment(map[string]any{"paidAmount": 1.0}), f.admin(t))
	failsWith(t, err, "IDEMPOTENCY_CONFLICT")
}

// Hono: courseCreditAutomaticEnrollment › enrollment batch failure rolls back and can resolve a raced replay
func TestEnrollmentFailureRollsBackAndResolvesRace(t *testing.T) {
	f := enrollmentSetup(t)
	attempts := failFirst(f.app, "class_students", 2, errors.New("membership write failed"))
	_, err := f.enroll(t, f.enrollment(nil), f.admin(t))
	failsWith(t, err, "ENROLLMENT_TRANSACTION_FAILED")
	if *attempts == 0 || f.count(t, "orders", "") != 0 || f.count(t, "credit_batches", "") != 0 {
		t.Fatalf("attempts = %d, rolled back orders = %d", *attempts, f.count(t, "orders", ""))
	}

	// A concurrent identical enrollment committed while this plan failed.
	put(t, f.app, "credit_operations", map[string]any{"type": "grant", "status": "committed", "operationNo": "raced",
		"idempotencyKey": "automaticEnrollment:race", "requestSnapshot": map[string]any{"requestHash": "hash"},
		"resultSnapshot": map[string]any{"orderId": "race-order", "status": "completed"}})
	raced, err := commitOrReplay(f.app, []step{update("orders", "missing", map[string]any{})}, "automaticEnrollment:race", "hash",
		enrollmentConflict, "ENROLLMENT_TRANSACTION_FAILED", map[string]any{})
	if err != nil || raced["replayed"] != true || raced["orderId"] != "race-order" {
		t.Fatalf("raced = %v, %v", raced, err)
	}
}

// Hono: courseCreditAutomaticEnrollment › enrollment validates package, price, class, membership, and required request facts
func TestEnrollmentValidation(t *testing.T) {
	f := enrollmentSetup(t)
	for _, item := range []struct {
		changes map[string]any
		actor   func(Actor) Actor
		code    string
	}{
		{map[string]any{"studentId": ""}, nil, "STUDENT_ID_REQUIRED"},
		{map[string]any{"packageId": ""}, nil, "PACKAGE_ID_REQUIRED"},
		{map[string]any{"priceVersionId": ""}, nil, "PRICE_VERSION_ID_REQUIRED"},
		{nil, func(a Actor) Actor { a.IdempotencyKey = ""; return a }, "IDEMPOTENCY_KEY_REQUIRED"},
		{nil, func(a Actor) Actor { a.ID = ""; return a }, "ACTOR_ID_REQUIRED"},
		{map[string]any{"channel": "wechat"}, nil, "ENROLLMENT_CHANNEL_INVALID"},
		{map[string]any{"paidAmount": -1.0}, nil, "ENROLLMENT_PAID_AMOUNT_INVALID"},
	} {
		actor := f.admin(t)
		if item.actor != nil {
			actor = item.actor(actor)
		}
		_, err := f.enroll(t, f.enrollment(item.changes), actor)
		failsWith(t, err, item.code)
	}

	otherPackage := testkit.Create(t, f.app, "packages", map[string]any{"code": "empty", "name": "空课包", "saleChannel": "all",
		"activationMode": "GRANT_TIME", "expiryPolicy": "FIXED_DURATION", "validityDurationDays": 90, "status": "active"})
	otherPrice := testkit.Create(t, f.app, "price_versions", map[string]any{"packageId": otherPackage.Id, "currency": "CNY",
		"listAmount": 100, "saleAmount": 100, "validFrom": "2020-01-01 00:00:00.000Z", "version": 1, "status": "active"})
	otherType := testkit.Create(t, f.app, "credit_types", map[string]any{"code": "other", "name": "其他", "kind": "course",
		"courseSpecId": f.specID, "consumable": true, "referenceUnitValue": 100, "status": "active"})
	for _, item := range []struct {
		collection, id string
		fields         map[string]any
		changes        map[string]any
		code           string
	}{
		{"packages", f.packageID, map[string]any{"status": "draft"}, nil, "ENROLLMENT_PACKAGE_INACTIVE"},
		{"", "", nil, map[string]any{"priceVersionId": otherPrice.Id}, "ENROLLMENT_PRICE_INVALID"},
		{"price_versions", f.priceID, map[string]any{"validTo": "2026-01-01 00:00:00.000Z"}, nil, "ENROLLMENT_PRICE_EXPIRED"},
		{"", "", nil, map[string]any{"packageId": otherPackage.Id, "priceVersionId": otherPrice.Id}, "ENROLLMENT_PACKAGE_EMPTY"},
		{"classes", f.classID, map[string]any{"status": "completed"}, nil, "ENROLLMENT_CLASS_CLOSED"},
		{"classes", f.classID, map[string]any{"defaultCreditTypeId": otherType.Id}, nil, "ENROLLMENT_CLASS_COURSE_MISMATCH"},
		{"credit_types", f.creditTypeID, map[string]any{"kind": "universal", "consumable": false, "courseSpecId": ""}, nil, "ORDER_CREDIT_TYPE_MISMATCH"},
	} {
		var restore map[string]any
		if item.collection != "" {
			restore = map[string]any{}
			current := f.first(t, item.collection, `id="`+item.id+`"`)
			for key := range item.fields {
				restore[key] = current[key]
			}
			patch(t, f.app, item.collection, item.id, item.fields)
		}
		_, err := f.enroll(t, f.enrollment(item.changes), f.admin(t))
		failsWith(t, err, item.code)
		if restore != nil {
			patch(t, f.app, item.collection, item.id, restore)
		}
	}

	put(t, f.app, "class_students", map[string]any{"classId": f.classID, "studentId": f.studentID, "status": "active", "effectiveFrom": "2026-01-01 00:00:00.000Z"})
	_, err := f.enroll(t, f.enrollment(nil), f.admin(t))
	failsWith(t, err, "ENROLLMENT_CLASS_MEMBERSHIP_EXISTS")
}

// Hono: courseCreditAutomaticEnrollment › enrollment helpers allocate weighted course values and cover expiry boundaries
func TestEnrollmentHelpers(t *testing.T) {
	pkg := map[string]any{"id": "package-1", "status": "active", "activationMode": "GRANT_TIME", "activationDeadlineDays": 0.0,
		"validityDurationDays": 180.0, "expiryPolicy": "FIXED_DURATION"}
	price := map[string]any{"id": "price-1", "packageId": "package-1", "currency": "CNY", "listAmount": 3000.0, "saleAmount": 2800.0,
		"validFrom": "2026-01-01T00:00:00Z", "validTo": "", "version": 1.0, "status": "active"}
	lines := []map[string]any{{"creditTypeId": "a", "quantity": 2.0}, {"creditTypeId": "b", "quantity": 1.0}}
	types := map[string]map[string]any{"a": {"referenceUnitValue": 100.0}, "b": {"referenceUnitValue": 200.0}}
	weighted := copyWith(copyWith(price, "listAmount", 400.0), "saleAmount", 320.0)
	snapshot := buildGrantSnapshot(pkg, weighted, lines, types, jsx.Undefined{})
	if got := snapshot["lines"].([]any); got[0].(map[string]any)["paidUnitCost"] != 80.0 || got[1].(map[string]any)["paidUnitCost"] != 160.0 {
		t.Fatalf("weighted = %v", got)
	}
	fallbackPackage := copyWith(copyWith(pkg, "activationDeadlineDays", 10.0), "validityDurationDays", nil)
	fallback := buildGrantSnapshot(fallbackPackage, price, []map[string]any{{"creditTypeId": "fallback", "quantity": 1.0}},
		map[string]map[string]any{"fallback": {"referenceUnitValue": 0.0}}, jsx.Undefined{})
	if fallback["activationDeadlineDays"] != 10.0 || fallback["validityDurationDays"] != 0.0 ||
		fallback["lines"].([]any)[0].(map[string]any)["paidUnitCost"] != 2800.0 {
		t.Fatalf("fallback = %v", fallback)
	}
	if roundMoney(1.005) != 1.01 {
		t.Fatal("roundMoney")
	}

	now := time.Date(2026, 7, 23, 8, 0, 0, 0, time.UTC)
	failsWith(t, validateEnrollmentResources(pkg, copyWith(price, "validFrom", "2027-01-01T00:00:00Z"), "package-1", now), "ENROLLMENT_PRICE_EXPIRED")
	for _, validTo := range []string{"", "2026-12-31T00:00:00Z"} {
		if err := validateEnrollmentResources(pkg, copyWith(price, "validTo", validTo), "package-1", now); err != nil {
			t.Fatalf("validTo %q: %v", validTo, err)
		}
	}
	_, err := buildOrder("2026-07-23T08:00:00.000Z", now, snapshot, bodyOf(map[string]any{"paidAmount": "not-a-number"}),
		"order", pkg, price, "key", "student-1", "admin", "")
	failsWith(t, err, "ENROLLMENT_PAID_AMOUNT_INVALID")
}

// Hono: courseCreditAutomaticEnrollment › enrollment defaults cover generated dependencies and optional payment metadata
func TestEnrollmentDefaults(t *testing.T) {
	f := enrollmentSetup(t)
	patch(t, f.app, "packages", f.packageID, map[string]any{"activationDeadlineDays": 5, "validityDurationDays": nil})
	patch(t, f.app, "credit_types", f.creditTypeID, map[string]any{"referenceUnitValue": 0})
	actor := f.admin(t)
	actor.Role, actor.TraceID = "", ""
	values := f.enrollment(map[string]any{"classId": "", "channel": nil, "paymentReference": "", "payerId": "", "reason": ""})
	result, err := f.enroll(t, values, actor)
	if err != nil || result["status"] != "awaiting_class_assignment" {
		t.Fatalf("result = %v, %v", result, err)
	}
	order := f.first(t, "orders", `id="`+result["orderId"].(string)+`"`)
	if order["channel"] != "admin" || order["payerId"] != f.studentID {
		t.Fatalf("order = %v", order)
	}
	if payment := f.first(t, "payment_events", `orderId="`+order["id"].(string)+`"`); !strings.HasPrefix(payment["providerEventId"].(string), "admin:") {
		t.Fatalf("payment = %v", payment)
	}
	operation := f.first(t, "credit_operations", `sourceId="`+order["id"].(string)+`"`)
	if operation["actorRole"] != "admin" || operation["traceId"] != "" || operation["reason"] != "admin_enrollment" {
		t.Fatalf("operation = %v", operation)
	}
}
