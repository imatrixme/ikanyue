package coursecredit

import (
	"net/http"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/tenancy"
	"kanyue.server/internal/testkit"
)

// Two tenants with the same codes and cellphone: the daily renewal scan runs per
// tenant and each reminder stays with its tenant; routes see only the request tenant.
func TestRenewalScanAndRoutesStayInsideTheTenant(t *testing.T) {
	f := renewalSetup(t, nil)
	testkit.WithTenants(t, f.app)
	other := tenancy.Scope(f.app, testkit.AddTenant(t, f.app, "另一家工作室"))
	mine, err := f.app.FindRecordById("students", f.studentID)
	if err != nil {
		t.Fatal(err)
	}
	student := testkit.Create(t, other, "students", map[string]any{"cellphone": mine.GetString("cellphone"), "realName": "学员乙"})
	spec := testkit.Create(t, other, "course_specs", map[string]any{"code": "vocal", "name": "声乐课程点", "deliveryMode": "group", "durationMinutes": 60, "status": "active"})
	credit := testkit.Create(t, other, "credit_types", map[string]any{"code": "vocal", "name": "声乐课时", "kind": "course", "courseSpecId": spec.Id, "consumable": true, "referenceUnitValue": 100, "status": "active"})
	put(t, other, "credit_batches", map[string]any{"studentId": student.Id, "creditTypeId": credit.Id, "originalQuantity": 4,
		"availableQuantity": 1, "consumedQuantity": 3, "status": "active", "effectiveExpiresAt": "2099-01-01 00:00:00.000Z"})

	tenancy.Job(f.app, "renewalReminders", func(app core.App) {
		if created, err := scanRenewals(app, nil, clock()); err != nil || created != 1 {
			t.Errorf("scan for %s = %d, %v", tenancy.ID(app), created, err)
		}
	})()
	for tenant, studentID := range map[string]string{tenancy.DefaultID: f.studentID, tenancy.ID(other): student.Id} {
		rows, err := tenancy.Scope(f.app, tenant).FindAllRecords("renewal_reminders")
		if err != nil || len(rows) != 1 || rows[0].GetString("studentId") != studentID || rows[0].GetString("courseSpecId") == "" {
			t.Fatalf("%s reminders = %v, %v", tenant, rows, err)
		}
	}

	candidates := items(ok(t, testkit.Call(t, f.handler, http.MethodGet, "/ops/course-credits/renewals", nil, f.ops), "ops list"))
	if len(candidates) != 1 || candidates[0]["studentName"] != "学员甲" {
		t.Fatalf("ops list must hold only the request tenant: %v", candidates)
	}
	// A token of another tenant's student finds nothing in the request tenant.
	stranger := f.token(t, student.Id, "student", nil)
	if unread := items(ok(t, testkit.Call(t, f.handler, http.MethodGet, "/v1/student/renewal-reminders", nil, stranger), "other tenant student")); len(unread) != 0 {
		t.Fatalf("other tenant's reminders leaked: %v", unread)
	}
}
