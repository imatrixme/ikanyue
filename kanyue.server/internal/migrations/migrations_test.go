package migrations

import (
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"kanyue.server/internal/testkit"
)

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
	if err != nil || len(applied) != 1 {
		t.Fatalf("Up = %v, %v", applied, err)
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
