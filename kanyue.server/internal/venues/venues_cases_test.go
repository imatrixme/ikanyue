package venues

import (
	"net/http"
	"reflect"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/testkit"
)

// Venue cases ported from Hono's opsVenues tests, over the venues collection the
// kanyue_0001_venues migration owns. The schema and default-venue case lives in
// internal/migrations.

func venueSetup(t *testing.T) (core.App, http.Handler, func(isAdmin bool) map[string]string) {
	t.Helper()
	app := testkit.NewApp(t)
	signer, err := auth.NewSigner(testkit.Secret)
	if err != nil {
		t.Fatal(err)
	}
	operator := testkit.Create(t, app, "teachers", map[string]any{"email": "ops@example.com", "password": "secret-password"})
	token := func(isAdmin bool) map[string]string {
		value, _ := signer.Sign(operator.Id, "T1", "teacher", isAdmin, auth.Claims{"scope": auth.OpsScope}, auth.OpsTokenTTL)
		return testkit.Bearer(value)
	}
	for _, fields := range []map[string]any{
		{"id": "venueb000000000", "name": "看乐二店", "status": "active", "sortOrder": 2, "bookable": false, "phone": "021-1234", "address": "二店地址"},
		{"id": "venuea000000000", "name": "看乐艺术", "status": "active", "sortOrder": 1, "bookable": true, "phone": "13800000000", "intro": "声乐课程与预约"},
		{"id": "venueoff0000000", "name": "已停用", "status": "inactive", "sortOrder": 0, "bookable": true},
	} {
		testkit.Create(t, app, "venues", fields)
	}
	return app, testkit.Serve(t, app, Module{Signer: signer}.Register), token
}

func venueItems(data map[string]any) []map[string]any {
	raw, _ := data["items"].([]any)
	result := make([]map[string]any, len(raw))
	for i, item := range raw {
		result[i], _ = item.(map[string]any)
	}
	return result
}

// Hono: opsVenues › public venue list needs no sign-in and returns active venues in sort order with display fields only
func TestPublicVenueList(t *testing.T) {
	_, handler, _ := venueSetup(t)
	result := testkit.Call(t, handler, http.MethodGet, "/v1/public/venues", nil, nil)
	if result.Code() != 10000 {
		t.Fatalf("public = %v", result.Body)
	}
	items := venueItems(result.Data())
	if len(items) != 2 || items[0]["id"] != "venuea000000000" || items[1]["id"] != "venueb000000000" {
		t.Fatalf("items = %v", items)
	}
	if !reflect.DeepEqual(items[0], map[string]any{"address": "", "bookable": true, "id": "venuea000000000", "intro": "声乐课程与预约",
		"name": "看乐艺术", "openingHours": "", "phone": "13800000000"}) || items[1]["bookable"] != false {
		t.Fatalf("projection = %v", items)
	}
}

// Hono: opsVenues › admin lists, creates, edits and deactivates venues with audit records
func TestAdminManagesVenues(t *testing.T) {
	app, handler, token := venueSetup(t)
	admin := token(true)
	list := venueItems(testkit.Call(t, handler, http.MethodGet, "/ops/venues", nil, admin).Data())
	got := [][2]any{}
	for _, item := range list {
		got = append(got, [2]any{item["id"], item["status"]})
	}
	if !reflect.DeepEqual(got, [][2]any{{"venueoff0000000", "inactive"}, {"venuea000000000", "active"}, {"venueb000000000", "active"}}) {
		t.Fatalf("admin list = %v", got)
	}

	if invalid := testkit.Call(t, handler, http.MethodPost, "/ops/venues", map[string]any{"name": " "}, admin); invalid.Code() != 400 ||
		invalid.Body["message"] != "场馆名称不能为空" {
		t.Fatalf("invalid = %v", invalid.Body)
	}
	created := testkit.Call(t, handler, http.MethodPost, "/ops/venues", map[string]any{"name": "看乐三店", "bookable": true,
		"openingHours": "每天 10:00-21:00", "sortOrder": 3}, admin)
	venue := created.Data()
	if created.Code() != 10000 || venue["status"] != "active" || venue["bookable"] != true {
		t.Fatalf("created = %v", created.Body)
	}
	updated := testkit.Call(t, handler, http.MethodPost, "/ops/venues/"+venue["id"].(string), map[string]any{"status": "inactive"}, admin).Data()
	if updated["status"] != "inactive" || updated["openingHours"] != "每天 10:00-21:00" {
		t.Fatalf("updated = %v", updated)
	}
	for _, item := range venueItems(testkit.Call(t, handler, http.MethodGet, "/v1/public/venues", nil, nil).Data()) {
		if item["id"] == venue["id"] {
			t.Fatal("inactive venue is public")
		}
	}
	logs, err := app.FindRecordsByFilter("ops_audit_logs", `resourceType="venues"`, "created", 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	actions := []string{}
	for _, log := range logs {
		actions = append(actions, log.GetString("action"))
	}
	if !reflect.DeepEqual(actions, []string{"ops.venue.create", "ops.venue.update"}) {
		t.Fatalf("audit = %v", actions)
	}
}

// Hono: opsVenues › venue management requires an ops admin
func TestVenueManagementRequiresAdmin(t *testing.T) {
	_, handler, token := venueSetup(t)
	if anonymous := testkit.Call(t, handler, http.MethodGet, "/ops/venues", nil, nil); anonymous.Code() == 10000 {
		t.Fatalf("anonymous = %v", anonymous.Body)
	}
	if teacher := testkit.Call(t, handler, http.MethodPost, "/ops/venues", map[string]any{"name": "越权场馆"}, token(false)); teacher.Code() != 403 {
		t.Fatalf("teacher = %v", teacher.Body)
	}
}

// Hono: opsVenues › venue payload validation trims fields and rejects oversize text and malformed phones
func TestVenuePayloadValidation(t *testing.T) {
	payload, err := validate(map[string]any{"name": " 看乐 ", "bookable": "true", "sortOrder": "2.7", "status": "bogus"})
	if err != nil || !reflect.DeepEqual(payload, map[string]any{"address": "", "bookable": true, "intro": "", "name": "看乐",
		"openingHours": "", "phone": "", "sortOrder": 2, "status": "active"}) {
		t.Fatalf("payload = %v, %v", payload, err)
	}
	if _, err := validate(map[string]any{"name": strings.Repeat("x", 41)}); err == nil || !strings.Contains(err.Error(), "场馆名称不能超过 40 个字") {
		t.Fatalf("long name = %v", err)
	}
	if _, err := validate(map[string]any{"name": "看乐", "phone": "call me"}); err == nil || !strings.Contains(err.Error(), "咨询电话") {
		t.Fatalf("phone = %v", err)
	}
	_, handler, token := venueSetup(t)
	blank := testkit.Call(t, handler, http.MethodPost, "/ops/venues/%20", map[string]any{"name": "新场馆"}, token(true))
	if blank.Code() != 400 || blank.Body["message"] != "场馆不能为空" {
		t.Fatalf("blank id = %v", blank.Body)
	}
	if total := len(venueItems(testkit.Call(t, handler, http.MethodGet, "/ops/venues", nil, token(true)).Data())); total != 3 {
		t.Fatalf("a blank id created a venue: %d", total)
	}
}
