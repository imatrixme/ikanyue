package coursecredit

import (
	"net/http"
	"slices"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/testkit"
)

// Teacher workload cases ported from Hono's courseCreditTeacherCreditService and
// the teacher-event cases of courseCreditOpsQueryService.

type teacherCreditFixture struct {
	ledgerFixture
	handler                    http.Handler
	admin, finance, own, other map[string]string
	teacherID, assignmentID    string
	earningID, operationID     string
}

func teacherCreditSetup(t *testing.T, earning map[string]any) teacherCreditFixture {
	t.Helper()
	f := ledgerSetup(t, true)
	signer, err := auth.NewSigner(testkit.Secret)
	if err != nil {
		t.Fatal(err)
	}
	teacherID := f.operatorID(t)
	other := testkit.Create(t, f.app, "teachers", map[string]any{"email": "other@example.com", "password": "admin-pass-1"})
	sign := func(id string, isAdmin bool, capabilities ...string) map[string]string {
		value, _ := signer.Sign(id, "T1", "teacher", isAdmin, auth.Claims{"scope": auth.OpsScope, "courseCreditCapabilities": capabilities}, auth.OpsTokenTTL)
		return testkit.Bearer(value)
	}
	assignment, err := f.app.FindFirstRecordByFilter("session_teachers", "teacherId={:id}", map[string]any{"id": teacherID})
	if err != nil {
		t.Fatal(err)
	}
	operation := put(t, f.app, "credit_operations", map[string]any{"type": "settle", "status": "committed", "operationNo": "settle-1", "idempotencyKey": "settle"})
	fields := map[string]any{"sessionTeacherId": assignment.Id, "teacherId": teacherID, "eventType": "earn", "quantityDelta": 1.25,
		"status": "pending", "operationId": operation.Id}
	for key, value := range earning {
		fields[key] = value
	}
	record := put(t, f.app, "teacher_credit_events", fields)
	return teacherCreditFixture{
		ledgerFixture: f,
		handler:       testkit.Serve(t, f.app, SessionsModule{Signer: signer, SettlementEnabled: true}.Register),
		admin:         sign(teacherID, true), finance: sign(teacherID, false, Finance), own: sign(teacherID, false, Teacher),
		other:     sign(other.Id, false, Teacher),
		teacherID: teacherID, assignmentID: assignment.Id, earningID: record.Id, operationID: operation.Id,
	}
}

func (f teacherCreditFixture) confirm(t *testing.T, headers map[string]string, key string, body map[string]any) testkit.Response {
	t.Helper()
	if key != "" {
		headers = with(headers, "Idempotency-Key", key)
	}
	return testkit.Call(t, f.handler, http.MethodPost, "/ops/course-credits/teacher-events/"+f.earningID+"/confirm", body, headers)
}

func (f teacherCreditFixture) confirmations(t *testing.T) []*core.Record {
	t.Helper()
	rows, err := f.app.FindRecordsByFilter("teacher_credit_events", `confirmationOfEventId="`+f.earningID+`"`, "", 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	return rows
}

// Hono: courseCreditTeacherCreditService › authorized confirmation appends a linked event and updates the assignment in one batch
// Hono: courseCreditTeacherCreditService › confirmation replays immutable results and resolves same-request races
// Hono: courseCreditTeacherCreditService › teacher credit helper validation exposes stable contracts
func TestConfirmTeacherCredit(t *testing.T) {
	f := teacherCreditSetup(t, nil)
	body := map[string]any{"reason": "finance approved"}
	result := ok(t, f.confirm(t, f.admin, "confirm-key", body), "confirm")
	if result["replayed"] != false || result["quantity"] != 1.25 || result["earningEventId"] != f.earningID || result["sessionTeacherId"] != f.assignmentID {
		t.Fatalf("confirm = %v", result)
	}
	confirmations := f.confirmations(t)
	if len(confirmations) != 1 || confirmations[0].GetString("eventType") != "confirm" || confirmations[0].GetString("status") != "confirmed" ||
		confirmations[0].GetFloat("quantityDelta") != 1.25 || confirmations[0].Id != result["confirmationEventId"] {
		t.Fatalf("confirmation = %v", confirmations)
	}
	if earning, _ := f.app.FindRecordById("teacher_credit_events", f.earningID); earning.GetString("status") != "pending" {
		t.Fatal("the earning row must stay immutable")
	}
	if assignment, _ := f.app.FindRecordById("session_teachers", f.assignmentID); assignment.GetString("creditStatus") != "confirmed" {
		t.Fatalf("assignment = %v", assignment.GetString("creditStatus"))
	}
	if operation, _ := findFirst(f.app, "credit_operations", `type="confirm_teacher_credit" && sourceId="`+f.earningID+`"`); operation == nil {
		t.Fatal("missing confirm_teacher_credit operation")
	}
	if event, _ := findFirst(f.app, "outbox_events", `topic="course-credit.teacher-credit-confirmed" && aggregateId="`+f.earningID+`"`); event == nil {
		t.Fatal("missing outbox event")
	}

	replayed := ok(t, f.confirm(t, f.admin, "confirm-key", body), "replay")
	if replayed["replayed"] != true || replayed["confirmationEventId"] != result["confirmationEventId"] || len(f.confirmations(t)) != 1 {
		t.Fatalf("replay = %v", replayed)
	}
	failed(t, f.confirm(t, f.admin, "confirm-key", map[string]any{"reason": "different reason"}), 400, "IDEMPOTENCY_CONFLICT", "key reuse")
	failed(t, f.confirm(t, f.admin, "other-key", body), 400, "TEACHER_CREDIT_ALREADY_CONFIRMED", "second command")
}

// Hono: courseCreditTeacherCreditService › compensation earnings use the same authorized confirmation transition
func TestConfirmCompensation(t *testing.T) {
	f := teacherCreditSetup(t, map[string]any{"eventType": "compensate", "quantityDelta": 0.75})
	result := ok(t, f.confirm(t, f.admin, "compensate-key", map[string]any{"reason": "finance approved"}), "compensation")
	if result["quantity"] != 0.75 || f.confirmations(t)[0].GetFloat("quantityDelta") != 0.75 {
		t.Fatalf("compensation = %v", result)
	}
}

// Hono: courseCreditTeacherCreditService › confirmation rejects an earning already confirmed under another command
// Hono: courseCreditTeacherCreditService › confirmation rejects a historical earning that was already reversed
// Hono: courseCreditTeacherCreditService › confirmation validates authorization, reason, event state, quantity, and relations
// Hono: courseCreditTeacherCreditService › confirmation keeps storage failure atomic and visible
func TestConfirmTeacherCreditRejections(t *testing.T) {
	f := teacherCreditSetup(t, nil)
	reason := map[string]any{"reason": "finance approved"}
	failed(t, f.confirm(t, f.finance, "k1", reason), 400, "TEACHER_CREDIT_CONFIRM_FORBIDDEN", "finance without admin")
	failed(t, f.confirm(t, f.own, "k1", reason), 403, "COURSE_CREDIT_CAPABILITY_REQUIRED", "teacher capability")
	failed(t, f.confirm(t, f.admin, "k1", map[string]any{"reason": " x "}), 400, "TEACHER_CREDIT_CONFIRM_REASON_REQUIRED", "short reason")
	failed(t, f.confirm(t, f.admin, "", reason), 400, "IDEMPOTENCY_KEY_REQUIRED", "missing key")

	reversedFixture := teacherCreditSetup(t, nil)
	put(t, reversedFixture.app, "teacher_credit_events", map[string]any{"sessionTeacherId": reversedFixture.assignmentID, "teacherId": reversedFixture.teacherID,
		"eventType": "reverse", "quantityDelta": -1.25, "status": "reversed", "operationId": reversedFixture.operationID, "reversalOfEventId": reversedFixture.earningID})
	failed(t, reversedFixture.confirm(t, reversedFixture.admin, "k2", reason), 400, "TEACHER_CREDIT_REVERSED", "reversed earning")
	put(t, f.app, "teacher_credit_events", map[string]any{"sessionTeacherId": f.assignmentID, "teacherId": f.teacherID, "eventType": "confirm",
		"quantityDelta": 1, "status": "confirmed", "operationId": f.operationID, "confirmationOfEventId": f.earningID})
	failed(t, f.confirm(t, f.admin, "k3", reason), 400, "TEACHER_CREDIT_ALREADY_CONFIRMED", "confirmed elsewhere")

	cases := []struct {
		earning map[string]any
		code    string
	}{
		{map[string]any{"eventType": "confirm"}, "TEACHER_CREDIT_NOT_PENDING"},
		{map[string]any{"status": "confirmed"}, "TEACHER_CREDIT_NOT_PENDING"},
		{map[string]any{"quantityDelta": 0}, "TEACHER_CREDIT_QUANTITY_INVALID"},
		{map[string]any{"sessionTeacherId": ""}, "TEACHER_CREDIT_RELATION_INVALID"},
	}
	for _, c := range cases {
		g := teacherCreditSetup(t, c.earning)
		failed(t, g.confirm(t, g.admin, "k", reason), 400, c.code, c.code)
	}
	mismatch := teacherCreditSetup(t, nil)
	if _, err := mismatch.app.DB().NewQuery("UPDATE session_teachers SET teacherId = 'someone' WHERE id = {:id}").Bind(map[string]any{"id": mismatch.assignmentID}).Execute(); err != nil {
		t.Fatal(err)
	}
	failed(t, mismatch.confirm(t, mismatch.admin, "k", reason), 400, "TEACHER_CREDIT_ASSIGNMENT_MISMATCH", "assignment teacher")
	notPending := teacherCreditSetup(t, nil)
	if _, err := notPending.app.DB().NewQuery("UPDATE session_teachers SET creditStatus = 'confirmed' WHERE id = {:id}").Bind(map[string]any{"id": notPending.assignmentID}).Execute(); err != nil {
		t.Fatal(err)
	}
	failed(t, notPending.confirm(t, notPending.admin, "k", reason), 400, "TEACHER_CREDIT_ASSIGNMENT_NOT_PENDING", "assignment status")
	missing := teacherCreditSetup(t, nil)
	if result := testkit.Call(t, missing.handler, http.MethodPost, "/ops/course-credits/teacher-events/missing/confirm", reason, with(missing.admin, "Idempotency-Key", "k")); result.Code() != 404 {
		t.Fatalf("missing earning = %v", result.Body)
	}

	// A failed plan writes nothing: the outbox step fails on a missing collection after the event step.
	atomic := teacherCreditSetup(t, nil)
	outbox, _ := atomic.app.FindCollectionByNameOrId("outbox_events")
	if err := atomic.app.Delete(outbox); err != nil {
		t.Fatal(err)
	}
	if result := atomic.confirm(t, atomic.admin, "k", reason); result.Code() == 10000 {
		t.Fatalf("plan without outbox = %v", result.Body)
	}
	if len(atomic.confirmations(t)) != 0 {
		t.Fatal("failed plan left a confirmation event")
	}
	if assignment, _ := atomic.app.FindRecordById("session_teachers", atomic.assignmentID); assignment.GetString("creditStatus") != "pending" {
		t.Fatal("failed plan changed the assignment")
	}
}

// Hono: courseCreditOpsQueryService › teacher workload queues hide resolved earnings and paginate confirmed events
// Hono: courseCreditOpsQueryService › teacher event detail is restricted to the current teacher outside admin scope
func TestTeacherEventQueries(t *testing.T) {
	f := teacherCreditSetup(t, nil)
	closed := put(t, f.app, "teacher_credit_events", map[string]any{"sessionTeacherId": f.assignmentID, "teacherId": f.teacherID, "eventType": "earn",
		"quantityDelta": 2, "status": "pending", "operationId": f.operationID})
	confirmation := put(t, f.app, "teacher_credit_events", map[string]any{"sessionTeacherId": f.assignmentID, "teacherId": f.teacherID, "eventType": "confirm",
		"quantityDelta": 2, "status": "confirmed", "operationId": f.operationID, "confirmationOfEventId": closed.Id})
	ids := func(data map[string]any) []string {
		result := []string{}
		for _, item := range items(data) {
			result = append(result, item["id"].(string))
		}
		return result
	}
	get := func(url string, headers map[string]string) testkit.Response {
		return testkit.Call(t, f.handler, http.MethodGet, url, nil, headers)
	}

	if pending := get("/ops/course-credits/teacher-events?status=pending", f.own).Data(); !slices.Equal(ids(pending), []string{f.earningID}) {
		t.Fatalf("pending = %v", pending)
	}
	confirmed := get("/ops/course-credits/teacher-events?status=confirmed&page=1&perPage=10", f.admin).Data()
	if !slices.Equal(ids(confirmed), []string{confirmation.Id}) || confirmed["perPage"] != float64(10) {
		t.Fatalf("confirmed = %v", confirmed)
	}
	if mine := get("/ops/course-credits/teacher-events?teacherId="+f.teacherID, f.other).Data(); len(items(mine)) != 0 {
		t.Fatalf("a teacher's teacherId filter is replaced by their own id: %v", mine)
	}
	if all := get("/ops/course-credits/teacher-events?teacherId="+f.teacherID, f.admin).Data(); all["totalItems"] != float64(3) {
		t.Fatalf("admin filter = %v", all)
	}
	failed(t, get("/ops/course-credits/teacher-events?status=bad", f.own), 400, "OPS_FILTER_STATUS_INVALID", "bad status")
	failed(t, get("/ops/course-credits/teacher-events?perPage=101", f.own), 400, "PER_PAGE_INVALID", "per page")
	failed(t, get("/ops/course-credits/teacher-events", f.finance), 403, "COURSE_CREDIT_CAPABILITY_REQUIRED", "finance only")

	if detail := get("/ops/course-credits/teacher-events/"+f.earningID, f.own).Data(); detail["id"] != f.earningID || detail["teacherId"] != f.teacherID {
		t.Fatalf("own detail = %v", detail)
	}
	failed(t, get("/ops/course-credits/teacher-events/"+f.earningID, f.other), 400, "TEACHER_EVENT_FORBIDDEN", "other teacher")
	if detail := get("/ops/course-credits/teacher-events/"+f.earningID, f.admin).Data(); detail["id"] != f.earningID {
		t.Fatalf("admin detail = %v", detail)
	}
	failed(t, get("/ops/course-credits/teacher-events/missing", f.admin), 400, "OPS_RESOURCE_NOT_FOUND", "missing")
}
