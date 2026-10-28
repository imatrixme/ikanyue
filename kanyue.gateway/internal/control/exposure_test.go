package control

import (
	"slices"
	"testing"

	"github.com/pocketbase/dbx"

	"kanyue.gateway/internal/exposure"
	"kanyue.gateway/internal/schema"
)

// A plan drafts exactly the listed operations the service serves as APIs of its
// group, reports the rest, replaces earlier drafts on the next run, and never releases.
func TestApplyExposure(t *testing.T) {
	c, app := newControl(t)
	upstream := newFakeService(t, manifestV1)
	if err := c.Heartbeat(Beat{Service: "kanyue.server", Address: upstream.address(), Stage: "RELEASE", ManifestHash: "h1"}); err != nil {
		t.Fatal(err)
	}
	waitFor(t, func() bool { return len(statuses(t, app)) == 3 })

	plan := exposure.Plan{Group: "mapi", Domains: []string{"mapi.ikanyue.com"}, APIs: []exposure.APIs{{Service: "kanyue.server",
		Operations: []string{"GET /v1/student/appointments", "POST /v1/student/appointments", "POST /v1/student/commerce/orders"}}}}
	applied, err := c.ApplyExposure(plan, "cli")
	if err != nil {
		t.Fatal(err)
	}
	if applied.Selected != 2 || len(applied.Added) != 2 || !slices.Equal(applied.NotServed, []string{"POST /v1/student/commerce/orders"}) {
		t.Fatalf("applied = %+v", applied)
	}
	group, err := app.FindFirstRecordByData(schema.APIGroups, "name", "mapi")
	if err != nil || group.Id != applied.GroupID {
		t.Fatalf("group = %v %v", group, err)
	}
	domains, _ := app.FindAllRecords(schema.GroupDomains, dbx.HashExp{"group": group.Id})
	if len(domains) != 1 || domains[0].GetString("host") != "mapi.ikanyue.com" {
		t.Fatalf("domains = %v", domains)
	}
	apis, _ := app.FindAllRecords(schema.APIs, dbx.HashExp{"group": group.Id})
	if len(apis) != 2 || apis[0].GetString("visibility") != "public" || apis[0].GetString("auth") != "passthrough" {
		t.Fatalf("apis = %v", apis)
	}
	if versions := c.handler.Versions(); versions["RELEASE"] != 0 {
		t.Fatalf("applying released version %d", versions["RELEASE"])
	}

	plan.APIs[0].Operations = []string{"GET /v1/student/appointments", "GET /v1/public/course-catalog"}
	plan.APIs[0].Auth = "signature"
	if applied, err = c.ApplyExposure(plan, "cli"); err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(applied.Added, []string{"GET /v1/public/course-catalog"}) || !slices.Equal(applied.Updated, []string{"GET /v1/student/appointments"}) ||
		!slices.Equal(applied.Removed, []string{"post-v1-student-appointments"}) {
		t.Fatalf("second apply = %+v", applied)
	}
	audits, err := app.FindAllRecords(schema.AuditLogs, dbx.HashExp{"action": "apply-exposure", "actor": "cli", "resourceId": group.Id})
	if err != nil || len(audits) != 2 {
		t.Fatalf("audit = %d %v", len(audits), err)
	}

	// A service that never registered fails the whole plan.
	plan.APIs = append(plan.APIs, exposure.APIs{Service: "kanyue.pay", Operations: []string{"GET /v1/x"}})
	if _, err := c.ApplyExposure(plan, "cli"); err == nil {
		t.Fatal("applied APIs of an unregistered service")
	}
}
