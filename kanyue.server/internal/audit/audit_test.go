package audit

import (
	"testing"

	"kanyue.server/internal/testkit"
)

// Hono: pointsLiteCoverage › audit, token utilities, and schema validation cover fallback paths
// Share-token helpers and the ops schema validator went with the deleted Hono routes;
// the audit fallbacks are what remains.
func TestRecordFallsBackAndNeverFailsTheCaller(t *testing.T) {
	app := testkit.NewApp(t)
	teacher := testkit.Create(t, app, "teachers", map[string]any{"sn": "T1", "email": "t1@example.com", "password": "teacher-pass"})
	Record(app, Entry{Actor: &Actor{ID: teacher.Id, Role: "teacher"}, Action: "ops.login", ResourceType: "teachers"})
	Denied(app, &Actor{ID: teacher.Id}, "ops.auth.login", "teacher", teacher.Id, map[string]any{"reason": "blocked"})
	Denied(app, &Actor{ID: "student_1", Role: "student"}, "course_credit.post", "course_credit_route", "/v1/x", nil)

	type row struct{ role, outcome, actorID, metadataActor string }
	var got []row
	records, err := app.FindRecordsByFilter(collection, "", "created", 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	for _, record := range records {
		metadata := map[string]any{}
		if err := record.UnmarshalJSONField("metadata", &metadata); err != nil {
			t.Fatal(err)
		}
		actor, _ := metadata["actorId"].(string)
		got = append(got, row{record.GetString("actorRole"), record.GetString("outcome"), record.GetString("actorId"), actor})
	}
	want := []row{
		{"teacher", "allowed", teacher.Id, ""},
		{"anonymous", "denied", teacher.Id, ""},
		{"student", "denied", "", "student_1"},
	}
	if len(got) != len(want) {
		t.Fatalf("records = %v", got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("record %d = %v, want %v", i, got[i], want[i])
		}
	}

	target, err := app.FindCollectionByNameOrId(collection)
	if err != nil {
		t.Fatal(err)
	}
	if err := app.Delete(target); err != nil {
		t.Fatal(err)
	}
	Record(app, Entry{Action: "ops.login"}) // a missing collection is logged, never returned
}
