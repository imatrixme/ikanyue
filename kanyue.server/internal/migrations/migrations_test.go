package migrations

import (
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"kanyue.server/internal/testkit"
)

// Hono: opsVenues › ops schema defines venues and the default venue is seeded only once
func TestUpCreatesVenuesOnceAndSeedsTheStudio(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	if err := RequireApplied(&core.ServeEvent{App: app}); err == nil || !strings.Contains(err.Error(), "kanyue_0001_venues") {
		t.Fatalf("serve must refuse and name the pending migration, got %v", err)
	}
	applied, err := Up(app)
	if err != nil || len(applied) != len(list.Items()) {
		t.Fatalf("Up = %v, %v", applied, err)
	}
	schema, err := app.FindCollectionByNameOrId("venues")
	if err != nil || schema.Fields.GetByName("bookable").Type() != core.FieldTypeBool {
		t.Fatalf("venues schema = %v, %v", schema, err)
	}
	venues, err := app.FindAllRecords("venues")
	if err != nil || len(venues) != 1 || venues[0].GetString("name") != "看乐艺术" || !venues[0].GetBool("bookable") {
		t.Fatalf("default venue = %v, %v", venues, err)
	}
	if pending, _ := Pending(app); len(pending) != 0 {
		t.Fatalf("pending after Up: %v", pending)
	}
	if again, err := Up(app); err != nil || len(again) != 0 {
		t.Fatalf("second Up = %v, %v", again, err)
	}
}

func TestUpKeepsExistingVenues(t *testing.T) {
	app := testkit.NewApp(t)
	testkit.Create(t, app, "venues", map[string]any{"name": "已停用场馆", "status": "inactive"})
	if _, err := Up(app); err != nil {
		t.Fatal(err)
	}
	if total, _ := app.CountRecords("venues"); total != 1 {
		t.Fatalf("existing venues must stay untouched, got %d", total)
	}
}

func TestUpStopsLoginsFromOverwritingCreated(t *testing.T) {
	app := testkit.NewApp(t)
	students, err := app.FindCollectionByNameOrId("students")
	if err != nil {
		t.Fatal(err)
	}
	students.Fields.Add(&core.AutodateField{Name: "created", OnCreate: true, OnUpdate: true})
	if err := app.Save(students); err != nil {
		t.Fatal(err)
	}
	student := testkit.Create(t, app, "students", map[string]any{"cellphone": "13800000009"})
	created := student.GetDateTime("created").String()

	if _, err := Up(app); err != nil {
		t.Fatal(err)
	}
	reloaded, err := app.FindRecordById("students", student.Id)
	if err != nil {
		t.Fatal(err)
	}
	time.Sleep(5 * time.Millisecond)
	reloaded.Set("lastLoginMethod", "password")
	if err := app.Save(reloaded); err != nil {
		t.Fatal(err)
	}
	if got := reloaded.GetDateTime("created").String(); got != created {
		t.Fatalf("created changed from %v to %v after an update", created, got)
	}
}

func TestUpLetsAuditKeepAnonymousAndStudentActors(t *testing.T) {
	app := testkit.NewApp(t)
	audits, err := app.FindCollectionByNameOrId("ops_audit_logs")
	if err != nil {
		t.Fatal(err)
	}
	audits.Fields.GetByName("actorRole").(*core.SelectField).Values = []string{"teacher", "admin"}
	if err := app.Save(audits); err != nil {
		t.Fatal(err)
	}
	for range 2 {
		if err := allowAuditActorRoles(app); err != nil {
			t.Fatal(err)
		}
	}
	audits, err = app.FindCollectionByNameOrId("ops_audit_logs")
	if err != nil {
		t.Fatal(err)
	}
	if values := audits.Fields.GetByName("actorRole").(*core.SelectField).Values; strings.Join(values, ",") != "teacher,admin,anonymous,student" {
		t.Fatalf("actorRole values = %v", values)
	}
}

func TestUpAddsRenewalRemindersWithUniqueAttempts(t *testing.T) {
	app := testkit.NewApp(t)
	for range 2 {
		if err := EnsureRenewalReminders(app); err != nil {
			t.Fatal(err)
		}
	}
	student := testkit.Create(t, app, "students", map[string]any{"realName": "学员"})
	reminder := map[string]any{"studentId": student.Id, "trigger": "manual", "reason": "manual",
		"dedupeKey": "manual:" + student.Id + ":2026-10-28", "wechatStatus": "skipped"}
	testkit.Create(t, app, "renewal_reminders", reminder)
	collection, err := app.FindCollectionByNameOrId("renewal_reminders")
	if err != nil {
		t.Fatal(err)
	}
	duplicate := core.NewRecord(collection)
	duplicate.Load(reminder)
	if err := app.Save(duplicate); err == nil {
		t.Fatal("a second reminder with the same dedupe key must be rejected")
	}
	subscriptions, err := app.FindCollectionByNameOrId("renewal_subscriptions")
	if err != nil || subscriptions.ListRule != nil || collection.ListRule != nil {
		t.Fatalf("renewal collections must stay superuser-only: %v", err)
	}
}
