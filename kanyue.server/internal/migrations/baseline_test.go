package migrations

import (
	"encoding/json"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func baselineNames(t *testing.T) []string {
	t.Helper()
	var items []struct{ Name string }
	if err := json.Unmarshal(baselineJSON, &items); err != nil {
		t.Fatal(err)
	}
	names := []string{}
	for _, item := range items {
		names = append(names, item.Name)
	}
	return names
}

func TestBaselineBuildsAnEmptyDatabase(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()
	if _, err := Up(app); err != nil {
		t.Fatal(err)
	}
	for _, name := range baselineNames(t) {
		if _, err := app.FindCollectionByNameOrId(name); err != nil {
			t.Fatalf("%s missing: %v", name, err)
		}
	}
	batches, _ := app.FindCollectionByNameOrId("credit_batches")
	students, _ := app.FindCollectionByNameOrId("students")
	relation, ok := batches.Fields.GetByName("studentId").(*core.RelationField)
	if !ok || relation.CollectionId != students.Id {
		t.Fatalf("relation = %#v", batches.Fields.GetByName("studentId"))
	}
	teachers, _ := app.FindCollectionByNameOrId("teachers")
	if teachers.AuthToken.Secret == "" || len(teachers.Indexes) == 0 {
		t.Fatalf("teachers = %+v", teachers)
	}

	// Records written through the new schema keep working end to end.
	student := core.NewRecord(students)
	student.Set("cellphone", "13900000000")
	if err := app.Save(student); err != nil {
		t.Fatal(err)
	}
	if again, err := Up(app); err != nil || len(again) != 0 {
		t.Fatalf("second Up = %v, %v", again, err)
	}
}

func TestBaselineOnlyAddsToExistingCollections(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()
	students := core.NewBaseCollection("students")
	students.Fields.Add(&core.TextField{Name: "cellphone"}, &core.TextField{Name: "legacyNote"})
	students.AddIndex("idx_students_legacy", false, "legacyNote", "")
	if err := app.Save(students); err != nil {
		t.Fatal(err)
	}
	if _, err := Up(app); err != nil {
		t.Fatal(err)
	}
	reloaded, _ := app.FindCollectionByNameOrId("students")
	if reloaded.Id != students.Id || reloaded.Fields.GetByName("legacyNote") == nil || reloaded.Fields.GetByName("realName") == nil {
		t.Fatalf("students = %v", reloaded.Fields.FieldNames())
	}
	if !indexNamed(reloaded, "idx_students_legacy") {
		t.Fatalf("indexes = %v", reloaded.Indexes)
	}
}

func TestIndexName(t *testing.T) {
	for index, want := range map[string]string{
		"CREATE INDEX idx_a ON a (x)":                      "idx_a",
		"CREATE UNIQUE INDEX `idx_b` ON `b` (`x`)":         "idx_b",
		"CREATE UNIQUE INDEX IF NOT EXISTS idx_c ON c (x)": "idx_c",
	} {
		if got := indexName(index); got != want {
			t.Fatalf("indexName(%q) = %q", index, got)
		}
	}
}
