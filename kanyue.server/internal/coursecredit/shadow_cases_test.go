package coursecredit

import (
	"fmt"
	"net/http"
	"reflect"
	"testing"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/testkit"
)

// Ports of Hono's courseCreditShadowService and courseCreditShadowRoutes tests.

func shadowActual(sessionID string) map[string]any {
	return map[string]any{
		"sessionId": sessionID, "canSettle": true, "sessionStatus": "completed",
		"students": []any{map[string]any{"sessionStudentId": "student-row", "studentId": "student", "action": "consume", "quantity": 1}},
		"teachers": []any{map[string]any{"sessionTeacherId": "teacher-row", "teacherId": "teacher", "action": "earn", "quantity": 1}},
	}
}

func shadowExpected(sessionID string) map[string]any {
	return map[string]any{
		"sessionId": sessionID, "canSettle": true,
		"students": []any{map[string]any{"sessionStudentId": "student-row", "action": "consume"}},
		"teachers": []any{map[string]any{"sessionTeacherId": "teacher-row", "action": "earn", "quantity": 1.0}},
	}
}

// Hono: courseCreditShadowService › shadow run compares representative real sessions without any write path
func TestShadowRunPassesMatchingExpectations(t *testing.T) {
	previews := []string{}
	result, err := shadowRun(map[string]any{"sessionIds": []any{"session-1"}, "expectations": []any{shadowExpected("session-1")}},
		func(sessionID string) (any, error) {
			previews = append(previews, sessionID)
			return shadowActual(sessionID), nil
		})
	if err != nil {
		t.Fatal(err)
	}
	if result["status"] != "passed" || result["writeCount"] != 0 || result["differenceCount"] != 0 || result["generatedAt"] == "" ||
		!reflect.DeepEqual(previews, []string{"session-1"}) {
		t.Fatalf("result = %v", result)
	}
}

// Hono: courseCreditShadowService › shadow run reports every academic expectation discrepancy and preview failure
func TestShadowRunReportsDiscrepancies(t *testing.T) {
	mismatch := shadowExpected("session-1")
	mismatch["canSettle"] = false
	mismatch["students"].([]any)[0].(map[string]any)["action"] = "release"
	mismatch["teachers"].([]any)[0].(map[string]any)["quantity"] = 2.0
	result, err := shadowRun(map[string]any{
		"sessionIds":   []any{"session-1", "missing-expectation", "broken"},
		"expectations": []any{mismatch, shadowExpected("broken")},
	}, func(sessionID string) (any, error) {
		if sessionID == "broken" {
			return nil, Fail("TEACHER_RULE_INVALID", "invalid rules", nil)
		}
		return shadowActual(sessionID), nil
	})
	if err != nil {
		t.Fatal(err)
	}
	reports := result["reports"].([]any)
	codes := func(index int) []any {
		values := []any{}
		for _, item := range reports[index].(map[string]any)["differences"].([]any) {
			values = append(values, item.(map[string]any)["code"])
		}
		return values
	}
	if result["status"] != "failed" || result["differenceCount"].(int) < 5 {
		t.Fatalf("result = %v", result)
	}
	if !reflect.DeepEqual(codes(0), []any{"CAN_SETTLE_MISMATCH", "EXPECTED_VALUE_MISMATCH", "EXPECTED_VALUE_MISMATCH"}) ||
		!reflect.DeepEqual(codes(1), []any{"EXPECTATION_MISSING"}) {
		t.Fatalf("codes = %v %v", codes(0), codes(1))
	}
	failure := reports[2].(map[string]any)["differences"].([]any)[0].(map[string]any)["actual"].(map[string]any)
	if failure["errorCode"] != "TEACHER_RULE_INVALID" || failure["message"] != "invalid rules" {
		t.Fatalf("failure = %v", failure)
	}
}

// Hono: courseCreditShadowService › shadow validation rejects missing, excessive, duplicate, and malformed expectations
func TestShadowValidation(t *testing.T) {
	many := []any{}
	for i := range 101 {
		many = append(many, fmt.Sprintf("session-%d", i))
	}
	for code, input := range map[string]map[string]any{
		"SHADOW_SESSION_IDS_REQUIRED":   {},
		"SHADOW_SESSION_LIMIT_EXCEEDED": {"sessionIds": many},
		"SHADOW_SESSION_DUPLICATE":      {"sessionIds": []any{"same", "same"}},
		"SHADOW_SESSION_ID_INVALID":     {"sessionIds": []any{""}},
		"SHADOW_EXPECTATION_DUPLICATE":  {"sessionIds": []any{"same"}, "expectations": []any{shadowExpected("same"), shadowExpected("same")}},
	} {
		_, err := shadowRun(input, func(string) (any, error) { t.Fatal("preview ran"); return nil, nil })
		migrationFailed(t, err, code)
	}
	for code, value := range map[string]any{
		"SHADOW_EXPECTATION_SESSION_REQUIRED": map[string]any{"canSettle": true},
		"SHADOW_EXPECTATION_SETTLE_REQUIRED":  map[string]any{"sessionId": "session"},
		"SHADOW_EXPECTATION_ROW_INVALID":      map[string]any{"sessionId": "session", "canSettle": true, "students": []any{map[string]any{}}},
		"SHADOW_EXPECTATION_ROW_DUPLICATE": map[string]any{"sessionId": "session", "canSettle": true, "teachers": []any{
			map[string]any{"sessionTeacherId": "row"}, map[string]any{"sessionTeacherId": " row "}}},
	} {
		_, err := normalizeShadowExpectation(value)
		migrationFailed(t, err, code)
	}
	if ids, err := validateShadowSessionIDs([]any{" session "}); err != nil || !reflect.DeepEqual(ids, []string{"session"}) {
		t.Fatalf("ids = %v %v", ids, err)
	}
}

// Hono: courseCreditShadowService › shadow row comparison detects missing, unexpected, and exact numeric values
func TestShadowRowComparison(t *testing.T) {
	if differences := compareShadowRows([]any{map[string]any{"id": "same", "quantity": 1.0}}, []any{map[string]any{"id": "same", "quantity": "1"}}, "id", "quantity"); len(differences) != 0 {
		t.Fatalf("numeric = %v", differences)
	}
	differences := compareShadowRows([]any{map[string]any{"id": "missing", "action": "consume"}}, []any{map[string]any{"id": "extra", "action": "release"}}, "id", "action")
	if len(differences) != 2 || differences[0].(map[string]any)["code"] != "EXPECTED_ROW_MISSING" || differences[1].(map[string]any)["code"] != "UNEXPECTED_ROW" {
		t.Fatalf("differences = %v", differences)
	}
	if differences := compareShadowRows([]any{}, nil, "id", "action"); len(differences) != 0 {
		t.Fatalf("empty = %v", differences)
	}
}

// Hono: courseCreditShadowService › shadow empty expectation and safe failure fallbacks remain deterministic
func TestShadowFallbacks(t *testing.T) {
	if expectations, err := shadowExpectations(nil); err != nil || len(expectations) != 0 {
		t.Fatalf("empty expectations = %v %v", expectations, err)
	}
	expectation, err := normalizeShadowExpectation(map[string]any{"sessionId": "session", "canSettle": false})
	if err != nil || !reflect.DeepEqual(expectation, map[string]any{"canSettle": false, "sessionId": "session", "students": []any{}, "teachers": []any{}}) {
		t.Fatalf("expectation = %v %v", expectation, err)
	}
	want := map[string]any{
		"actual": nil,
		"differences": []any{map[string]any{"actual": map[string]any{"errorCode": "COURSE_CREDIT_INTERNAL_ERROR", "message": "影子计算失败"},
			"code": "SHADOW_PREVIEW_FAILED", "expected": nil, "field": "session"}},
		"expectationProvided": false, "expected": nil, "sessionId": "session",
	}
	if got := failedShadowSession("session", nil, nil); !reflect.DeepEqual(got, want) {
		t.Fatalf("failed = %v", got)
	}
	// Internal errors keep their detail out of the report.
	if got := failedShadowSession("session", fmt.Errorf("disk on fire"), nil); got["differences"].([]any)[0].(map[string]any)["actual"].(map[string]any)["message"] != "影子计算失败" {
		t.Fatalf("internal = %v", got)
	}
}

// Hono: courseCreditShadowRoutes › shadow preview requires combined academic and settlement scope
// The route runs the real settlement preview, so a missing session reports a failure without writing.
func TestShadowRouteRequiresAcademicAndSettlement(t *testing.T) {
	app := testkit.NewApp(t)
	signer, err := auth.NewSigner(testkit.Secret)
	if err != nil {
		t.Fatal(err)
	}
	handler := testkit.Serve(t, app, MigrationModule{Signer: signer}.Register)
	body := map[string]any{"sessionIds": []any{"missingsession1"}, "expectations": []any{}}
	allowed := ok(t, testkit.Call(t, handler, http.MethodPost, "/ops/course-credits/shadow/preview", body,
		opsHeaders(t, signer, "operator", false, Academic, Settlement)), "shadow")
	report := allowed["reports"].([]any)[0].(map[string]any)
	if allowed["writeCount"] != 0.0 || allowed["sessionCount"] != 1.0 ||
		report["differences"].([]any)[0].(map[string]any)["code"] != "SHADOW_PREVIEW_FAILED" {
		t.Fatalf("shadow = %v", allowed)
	}
	failed(t, testkit.Call(t, handler, http.MethodPost, "/ops/course-credits/shadow/preview", body,
		opsHeaders(t, signer, "academic", false, Academic)), 403, "COURSE_CREDIT_CAPABILITY_REQUIRED", "academic only")
}
