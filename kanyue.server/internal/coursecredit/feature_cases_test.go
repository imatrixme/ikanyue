package coursecredit

import (
	"net/http"
	"testing"

	"kanyue.server/internal/testkit"
)

// Feature gate cases ported from Hono's courseCreditFeatureFlags tests. Go reads
// each switch into its module, so there is no gate object or unknown-feature code;
// the conversion switches went with the deleted student conversion endpoints.

// Hono: courseCreditFeatureFlags › feature gate rejects disabled and unknown features with stable business codes
// Hono: courseCreditFeatureFlags › disabled production features block write routes before services are loaded
func TestDisabledFeaturesBlockWriteRoutes(t *testing.T) {
	f := ledgerSetup(t, false)
	_, signer := adminRoutes(t, f)
	handler := testkit.Serve(t, f.app, LedgerModule{Signer: signer}.Register,
		BookingModule{Signer: signer}.Register, SessionsModule{Signer: signer}.Register)
	for _, request := range []struct {
		path    string
		headers map[string]string
		feature string
	}{
		{"/ops/course-credits/orders/order/grant", f.ops, "grants"},
		{"/ops/course-credits/sessions/" + f.sessionID + "/settle", f.ops, "settlement"},
		{"/v1/teacher/appointments/appointment/confirm", f.plain, "reservation"},
		{"/ops/course-bookings/appointments/appointment/confirm", f.ops, "reservation"},
	} {
		result := testkit.Call(t, handler, http.MethodPost, request.path, nil, with(request.headers, "Idempotency-Key", "gated"))
		failed(t, result, 400, "COURSE_CREDIT_FEATURE_DISABLED", request.path)
		if details, _ := result.Body["details"].(map[string]any); details["feature"] != request.feature {
			t.Fatalf("%s details = %v", request.path, result.Body)
		}
	}
	if count := f.count(t, "credit_operations", ""); count != 0 {
		t.Fatalf("disabled routes wrote %d operations", count)
	}
}
