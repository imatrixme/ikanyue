package control

import (
	"slices"
	"testing"

	"github.com/pocketbase/dbx"

	"kanyue.gateway/internal/exposure"
	"kanyue.gateway/internal/schema"
)

// A plan selects exactly the listed operations the service serves, reports the
// rest, replaces earlier selections on the next run, and never publishes.
func TestApplyExposure(t *testing.T) {
	c, app := newControl(t)
	upstream := newFakeService(t, manifestV1)
	if err := c.Heartbeat(Beat{Service: "kanyue.server", Address: upstream.address(), Stage: "RELEASE", ManifestHash: "h1"}); err != nil {
		t.Fatal(err)
	}
	waitFor(t, func() bool { return len(statuses(t, app)) == 3 })

	plan := exposure.Plan{Site: "mapi", Hosts: []string{"mapi.ikanyue.com"}, Routes: []exposure.Route{{Name: "miniapp", Service: "kanyue.server",
		Operations: []string{"GET /v1/student/appointments", "POST /v1/student/appointments", "POST /v1/student/commerce/orders"}}}}
	applied, err := c.ApplyExposure(plan, "cli")
	if err != nil {
		t.Fatal(err)
	}
	if len(applied) != 1 || applied[0].Selected != 2 || len(applied[0].Added) != 2 ||
		!slices.Equal(applied[0].NotServed, []string{"POST /v1/student/commerce/orders"}) {
		t.Fatalf("applied = %+v", applied)
	}
	route, err := app.FindFirstRecordByData(schema.Routes, "name", "miniapp")
	if err != nil || len(route.GetStringSlice("operations")) != 2 || !route.GetBool("enabled") {
		t.Fatalf("route = %v %v", route, err)
	}
	site, err := app.FindRecordById(schema.Sites, route.GetString("site"))
	if err != nil || site.GetString("name") != "mapi" || site.GetString("hosts") != `["mapi.ikanyue.com"]` {
		t.Fatalf("site = %v %v", site, err)
	}
	if c.handler.Version() != 0 {
		t.Fatalf("applying published version %d", c.handler.Version())
	}

	plan.Routes[0].Operations = []string{"GET /v1/student/appointments", "GET /v1/public/course-catalog"}
	if applied, err = c.ApplyExposure(plan, "cli"); err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(applied[0].Added, []string{"GET /v1/public/course-catalog"}) ||
		!slices.Equal(applied[0].Removed, []string{"POST /v1/student/appointments"}) {
		t.Fatalf("second apply = %+v", applied[0])
	}
	audits, err := app.FindAllRecords(schema.AuditLogs, dbx.HashExp{"action": "apply-exposure", "actor": "cli", "resourceId": route.Id})
	if err != nil || len(audits) != 2 {
		t.Fatalf("audit = %d %v", len(audits), err)
	}

	// A service that never registered fails the whole plan.
	plan.Routes = append(plan.Routes, exposure.Route{Name: "pay", Service: "kanyue.pay", Operations: []string{"GET /v1/x"}})
	if _, err := c.ApplyExposure(plan, "cli"); err == nil {
		t.Fatal("applied a route of an unregistered service")
	}
}
