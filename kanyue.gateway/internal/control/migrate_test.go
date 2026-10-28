package control

import (
	"net/http"
	"testing"

	"github.com/pocketbase/dbx"

	"kanyue.gateway/internal/policy"
	"kanyue.gateway/internal/schema"
)

// A published site and route configuration becomes a group whose APIs are
// released as version 1 in every environment and serve what was published: a
// route's rate limit still replaces the global one. Unpublished edits are not
// carried over, and the migration runs once.
func TestMigrateLegacyKeepsWhatWasPublished(t *testing.T) {
	c, app := newControl(t)
	service := registered(t, c, app, newFakeService(t, manifestV1))
	var ops []string
	records, err := app.FindAllRecords(schema.Operations, dbx.HashExp{"service": service.Id})
	if err != nil {
		t.Fatal(err)
	}
	for _, op := range records {
		ops = append(ops, op.Id)
	}
	site := create(t, app, schema.Sites, map[string]any{"name": "MAPI site", "hosts": []string{"*"}})
	route := create(t, app, schema.Routes, map[string]any{"name": "server", "site": site.Id, "service": service.Id,
		"operations": ops, "enabled": true, "timeoutMs": 5000})
	create(t, app, schema.PluginBindings, map[string]any{"plugin": "rate-limit", "scope": "global",
		"config": map[string]any{"limit": 100, "window": "minute", "by": "ip"}, "enabled": true})
	create(t, app, schema.PluginBindings, map[string]any{"plugin": "cors", "scope": "site", "site": site.Id,
		"config": map[string]any{"allowOrigins": []string{"https://www.ikanyue.com"}}, "enabled": true})
	create(t, app, schema.PluginBindings, map[string]any{"plugin": "rate-limit", "scope": "route", "route": route.Id,
		"config": map[string]any{"limit": 2, "window": "minute", "by": "ip"}, "enabled": true})
	published, err := collectLegacy(app)
	if err != nil {
		t.Fatal(err)
	}
	published.Version = 4
	create(t, app, schema.ConfigVersions, map[string]any{"version": 4, "config": published, "publishedBy": "ops"})
	route.Set("timeoutMs", 9000) // an edit that was never published
	if err := app.Save(route); err != nil {
		t.Fatal(err)
	}

	if err := c.migrateLegacy(); err != nil {
		t.Fatal(err)
	}
	group, err := app.FindFirstRecordByData(schema.APIGroups, "name", "mapi-site")
	if err != nil {
		t.Fatal(err)
	}
	apis, _ := app.FindAllRecords(schema.APIs, dbx.HashExp{"group": group.Id})
	if len(apis) != 3 || apis[0].GetInt("timeoutMs") != 5000 {
		t.Fatalf("apis = %v", apis)
	}
	if versions := c.handler.Versions(); versions["RELEASE"] != 1 || versions["PRE"] != 1 || versions["TEST"] != 1 {
		t.Fatalf("versions = %v", versions)
	}
	for i := range 2 {
		if res := through(c, http.MethodGet, "http://mapi.ikanyue.com/v1/public/course-catalog", ""); res.Code != 200 {
			t.Fatalf("request %d = %d", i, res.Code)
		}
	}
	if res := through(c, http.MethodGet, "http://mapi.ikanyue.com/v1/public/course-catalog", ""); res.Code != 429 {
		t.Fatalf("the route's limit no longer replaces the global one: %d", res.Code)
	}
	view, err := c.Effective(apis[0].Id, "PRE")
	if err != nil || view.Served == nil || len(view.Served.Policies) != 2 {
		t.Fatalf("effective = %+v %v", view, err)
	}
	var layers []string
	for _, e := range view.Served.Policies {
		layers = append(layers, e.Plugin+"@"+e.Layer)
	}
	if layers[0] != "cors@"+policy.GroupSet || layers[1] != "rate-limit@"+policy.Overrides {
		t.Fatalf("migrated policies = %v", layers)
	}
	audit, err := app.FindFirstRecordByData(schema.AuditLogs, "action", "migrate")
	if err != nil || !(audit.GetString("detail") != "" && audit.GetString("actor") == "migration") {
		t.Fatalf("audit = %v %v", audit, err)
	}

	// It runs once: a second start changes nothing.
	if err := c.migrateLegacy(); err != nil {
		t.Fatal(err)
	}
	if n, _ := app.CountRecords(schema.APIGroups); n != 1 {
		t.Fatalf("groups after a second start = %d", n)
	}
}
