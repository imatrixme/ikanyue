package devseed

import (
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"kanyue.server/internal/migrations"
)

func count(t *testing.T, app core.App, collection string, where dbx.Expression) int {
	t.Helper()
	total, err := app.CountRecords(collection, where)
	if err != nil {
		t.Fatal(err)
	}
	return int(total)
}

// An empty migrated database gets every local fixture, and a second run adds nothing.
func TestLocalSeedsAMigratedDatabaseIdempotently(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()
	if _, err := migrations.Up(app); err != nil {
		t.Fatal(err)
	}
	options := Options{StudentPassword: "student-pass", TeacherPassword: "teacher-password",
		AdminEmail: "admin@local.test", AdminCellphone: "10000000000", Now: time.Now()}
	for range 2 {
		if err := app.RunInTransaction(func(tx core.App) error { return Local(tx, options) }); err != nil {
			t.Fatal(err)
		}
	}
	admin, err := app.FindFirstRecordByFilter("teachers", "username = 'admin'")
	if err != nil || !admin.ValidatePassword("teacher-password") || !admin.GetBool("isAdmin") {
		t.Fatalf("admin = %v, %v", admin, err)
	}
	for collection, want := range map[string]int{"students": 2, "reward_items": 3, "activities": 1, "point_events": 2,
		"course_specs": 1, "teacher_course_offerings": 1, "credit_batches": 2, "packages": 2, "commerce_offers": 2} {
		if got := count(t, app, collection, nil); got != want {
			t.Errorf("%s = %d, want %d", collection, got, want)
		}
	}
	if count(t, app, "credit_batches", dbx.HashExp{"availableQuantity": lessonQuantity}) != 2 {
		t.Error("every student holds 10 lessons")
	}
}

func TestOptionsRefuseProductionAndMissingFlag(t *testing.T) {
	env := map[string]string{"KANYUE_LOCAL_SEED": "true", "LOCAL_STUDENT_PASSWORD": "a", "LOCAL_TEACHER_PASSWORD": "b",
		"OPS_BOOTSTRAP_ADMIN_EMAIL": "c", "OPS_BOOTSTRAP_ADMIN_CELLPHONE": "d"}
	lookup := func(key string) string { return env[key] }
	if _, err := OptionsFromEnv(lookup); err != nil {
		t.Fatal(err)
	}
	env["NODE_ENV"] = "production"
	if _, err := OptionsFromEnv(lookup); err == nil {
		t.Fatal("production must be refused")
	}
	env["NODE_ENV"], env["KANYUE_LOCAL_SEED"] = "", ""
	if _, err := OptionsFromEnv(lookup); err == nil {
		t.Fatal("missing KANYUE_LOCAL_SEED must be refused")
	}
}
