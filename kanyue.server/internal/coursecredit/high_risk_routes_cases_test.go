package coursecredit

import (
	"net/http"
	"strings"
	"testing"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/testkit"
)

// High-risk route cases ported from Hono's courseCreditHighRiskRoutes tests. Go
// routes run the real services, so the cases check capability gates and the
// authenticated actor written to the ledger instead of mocked call arguments.

func highRiskRoutes(t *testing.T, f settlementFixture) (http.Handler, *auth.Signer) {
	t.Helper()
	signer, err := auth.NewSigner(testkit.Secret)
	if err != nil {
		t.Fatal(err)
	}
	return testkit.Serve(t, f.app, LedgerModule{Signer: signer, GrantsEnabled: true, Dispatcher: &fakeDispatcher{}}.Register,
		SessionsModule{Signer: signer, SettlementEnabled: true}.Register), signer
}

// notDenied fails when a capability gate rejected the request.
func notDenied(t *testing.T, result testkit.Response, what string) {
	t.Helper()
	routed(t, result, what)
	if result.Status == http.StatusForbidden || result.Status == http.StatusUnauthorized {
		t.Fatalf("%s denied: %v", what, result.Body)
	}
}

// Hono: courseCreditHighRiskRoutes › authorized high-risk operators invoke every explicit route with authenticated metadata
func TestHighRiskRoutesUseAuthenticatedActor(t *testing.T) {
	f := settlementSetup(t, nil)
	handler, signer := highRiskRoutes(t, f)
	operator := f.operatorID(t)
	headers := opsHeaders(t, signer, operator, false, Academic, Settlement, Audit)
	post := func(path string, body any) testkit.Response {
		return testkit.Call(t, handler, http.MethodPost, "/ops/course-credits/"+path, body, headers)
	}

	settled := post("sessions/"+f.sessionID+"/settle", map[string]any{"reason": "lesson completed"})
	if settled.Code() != 10000 {
		t.Fatalf("settle = %v", settled.Body)
	}
	reversed := post("sessions/"+f.sessionID+"/reverse-settlement", map[string]any{"reason": "attendance correction"})
	if reversed.Code() != 10000 {
		t.Fatalf("reverse = %v", reversed.Body)
	}
	for _, id := range []string{settled.Data()["operationId"].(string), reversed.Data()["operationId"].(string)} {
		if operation := f.first(t, "credit_operations", `id="`+id+`"`); operation["actorId"] != operator || operation["traceId"] != "admin-trace" {
			t.Fatalf("operation = %v", operation)
		}
	}

	extended := post("batches/"+f.batches["present"]+"/extend", map[string]any{
		"newExpiresAt": "2026-12-31T00:00:00Z", "reason": "approved extension", "approvedBy": "forged"})
	if extended.Code() != 10000 {
		t.Fatalf("extend = %v", extended.Body)
	}
	// The approver comes from the token; a forged body field never reaches the ledger.
	if operation := f.first(t, "credit_operations", `id="`+extended.Data()["operationId"].(string)+`"`); operation["actorId"] != operator ||
		strings.Contains(fmtJSON(operation), "forged") {
		t.Fatalf("extend operation = %v", operation)
	}
	notDenied(t, post("batches/"+f.batches["present"]+"/restore-expired", map[string]any{
		"quantity": 2, "validityDurationDays": 30, "reason": "service recovery"}), "restore")
	notDenied(t, post("sessions/"+f.sessionID+"/reschedule", map[string]any{
		"newStartAt": "2026-08-01T10:00:00Z", "newEndAt": "2026-08-01T11:00:00Z", "reason": "teacher unavailable"}), "reschedule")
	for path, body := range map[string]any{
		"reconciliation/runs":    map[string]any{"scope": "incremental", "since": "2026-07-17T00:00:00Z"},
		"workers/expiry/run":     map[string]any{"limit": 25, "now": "forged"},
		"workers/outbox/deliver": map[string]any{"limit": 10},
	} {
		if result := post(path, body); result.Code() != 10000 {
			t.Fatalf("%s = %v", path, result.Body)
		}
	}
}

// Hono: courseCreditHighRiskRoutes › financial-only operators cannot invoke settlement or audit actions
func TestHighRiskRoutesRejectFinanceOnly(t *testing.T) {
	f := settlementSetup(t, nil)
	handler, signer := highRiskRoutes(t, f)
	finance := opsHeaders(t, signer, f.operatorID(t), false, Finance)
	for _, path := range []string{"sessions/" + f.sessionID + "/settle", "reconciliation/runs", "workers/expiry/run", "workers/outbox/deliver"} {
		failed(t, testkit.Call(t, handler, http.MethodPost, "/ops/course-credits/"+path, map[string]any{"scope": "full"}, finance),
			403, "COURSE_CREDIT_CAPABILITY_REQUIRED", path)
	}
	if f.count(t, "credit_operations", `type="settle_session"`) != 0 || f.count(t, "reconciliation_runs", "") != 0 {
		t.Fatal("denied routes wrote")
	}
}

// Hono: courseCreditHighRiskRoutes › academic and settlement capabilities stay separated for rescheduling and settlement
func TestHighRiskRoutesSeparateAcademicAndSettlement(t *testing.T) {
	f := settlementSetup(t, func(settlementFixture) map[string]any {
		return map[string]any{"status": "scheduled", "startAt": "2027-08-02T10:00:00Z", "endAt": "2027-08-02T11:00:00Z"}
	})
	handler, signer := highRiskRoutes(t, f)
	academic := opsHeaders(t, signer, "academic", false, Academic)
	settlement := opsHeaders(t, signer, "settlement", false, Settlement)
	reschedule := "/ops/course-credits/sessions/" + f.sessionID + "/reschedule"
	settle := "/ops/course-credits/sessions/" + f.sessionID + "/settle"

	if result := testkit.Call(t, handler, http.MethodPost, reschedule, map[string]any{
		"newStartAt": "2027-08-03T10:00:00Z", "newEndAt": "2027-08-03T11:00:00Z", "reason": "academic adjustment"}, academic); result.Code() != 10000 {
		t.Fatalf("academic reschedule = %v", result.Body)
	}
	failed(t, testkit.Call(t, handler, http.MethodPost, settle, nil, academic), 403, "COURSE_CREDIT_CAPABILITY_REQUIRED", "academic settle")
	failed(t, testkit.Call(t, handler, http.MethodPost, reschedule, map[string]any{
		"newStartAt": "2027-08-04T10:00:00Z", "newEndAt": "2027-08-04T11:00:00Z", "reason": "forbidden adjustment"}, settlement),
		403, "COURSE_CREDIT_CAPABILITY_REQUIRED", "settlement reschedule")
	notDenied(t, testkit.Call(t, handler, http.MethodPost, settle, nil, settlement), "settlement settle")
}
