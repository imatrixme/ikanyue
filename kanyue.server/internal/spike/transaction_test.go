// Package spike proves the property the Go rewrite depends on: multi-collection
// writes inside RunInTransaction either all commit or all roll back.
package spike

import (
	"errors"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	// Registers PocketBase system migrations (collections, params, auth tables).
	_ "github.com/pocketbase/pocketbase/migrations"
)

func newApp(t *testing.T) core.App {
	t.Helper()
	app := core.NewBaseApp(core.BaseAppConfig{DataDir: t.TempDir()})
	if err := app.Bootstrap(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = app.ResetBootstrapState() })
	for _, name := range []string{"credit_batches", "credit_events"} {
		collection := core.NewBaseCollection(name)
		collection.Fields.Add(&core.NumberField{Name: "quantity"})
		if err := app.Save(collection); err != nil {
			t.Fatal(err)
		}
	}
	return app
}

func write(app core.App, name string, quantity int) error {
	collection, err := app.FindCollectionByNameOrId(name)
	if err != nil {
		return err
	}
	record := core.NewRecord(collection)
	record.Set("quantity", quantity)
	return app.Save(record)
}

func count(t *testing.T, app core.App, name string) int64 {
	t.Helper()
	total, err := app.CountRecords(name)
	if err != nil {
		t.Fatal(err)
	}
	return total
}

func TestFailedCommandLeavesNoPartialWrites(t *testing.T) {
	app := newApp(t)
	failure := errors.New("settlement rule violated")

	err := app.RunInTransaction(func(tx core.App) error {
		if err := write(tx, "credit_batches", 10); err != nil {
			return err
		}
		if err := write(tx, "credit_events", -1); err != nil {
			return err
		}
		return failure
	})

	if !errors.Is(err, failure) {
		t.Fatalf("unexpected error: %v", err)
	}
	if count(t, app, "credit_batches") != 0 || count(t, app, "credit_events") != 0 {
		t.Fatal("partial writes survived the rollback")
	}
}

func TestSuccessfulCommandCommitsAllWrites(t *testing.T) {
	app := newApp(t)

	err := app.RunInTransaction(func(tx core.App) error {
		if err := write(tx, "credit_batches", 10); err != nil {
			return err
		}
		return write(tx, "credit_events", -1)
	})

	if err != nil {
		t.Fatal(err)
	}
	if count(t, app, "credit_batches") != 1 || count(t, app, "credit_events") != 1 {
		t.Fatal("committed writes missing")
	}
}
