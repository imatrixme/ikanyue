package tenancy_test

import (
	"database/sql"
	"errors"
	"slices"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/tenancy"
	"kanyue.server/internal/testkit"
)

func TestScopedAppKeepsTenantsApart(t *testing.T) {
	app := testkit.NewApp(t)
	testkit.WithTenants(t, app)
	mineApp := tenancy.Scope(app, tenancy.DefaultID)
	theirsApp := tenancy.Scope(app, testkit.AddTenant(t, app, "另一家工作室"))
	mine := testkit.Create(t, mineApp, "students", map[string]any{"realName": "学员甲"})
	// A tenant sent along with the data is ignored.
	theirs := testkit.Create(t, theirsApp, "students", map[string]any{"realName": "学员乙", tenancy.Field: tenancy.DefaultID})
	if theirs.GetString(tenancy.Field) != tenancy.ID(theirsApp) || mine.GetString(tenancy.Field) != tenancy.DefaultID {
		t.Fatalf("tenants = %q, %q", mine.GetString(tenancy.Field), theirs.GetString(tenancy.Field))
	}

	only := func(what string, records []*core.Record, err error) {
		t.Helper()
		if err != nil || len(records) != 1 || records[0].Id != mine.Id {
			t.Fatalf("%s = %v, %v", what, records, err)
		}
	}
	missing := func(what string, err error) {
		t.Helper()
		if !errors.Is(err, sql.ErrNoRows) {
			t.Fatalf("%s must answer not found, got %v", what, err)
		}
	}
	records, err := mineApp.FindRecordsByFilter("students", "", "", 0, 0)
	only("all by filter", records, err)
	// An OR in the caller's filter cannot widen the tenant condition.
	records, err = mineApp.FindRecordsByFilter("students", "realName={:a} || realName={:b}", "", 0, 0, dbx.Params{"a": "学员甲", "b": "学员乙"})
	only("or filter", records, err)
	records, err = mineApp.FindAllRecords("students")
	only("find all", records, err)
	records, err = mineApp.FindRecordsByIds("students", []string{mine.Id, theirs.Id})
	only("by ids", records, err)
	records = []*core.Record{}
	err = mineApp.RecordQuery("students").All(&records)
	only("record query", records, err)
	if total, err := mineApp.CountRecords("students"); err != nil || total != 1 {
		t.Fatalf("count = %d, %v", total, err)
	}
	_, err = mineApp.FindRecordById("students", theirs.Id)
	missing("by id", err)
	_, err = mineApp.FindFirstRecordByFilter("students", "realName={:name}", dbx.Params{"name": "学员乙"})
	missing("first by filter", err)
	_, err = mineApp.FindFirstRecordByData("students", "realName", "学员乙")
	missing("first by data", err)

	loaded, err := app.FindRecordById("students", theirs.Id)
	if err != nil {
		t.Fatal(err)
	}
	loaded.Set("realName", "改名")
	if err := mineApp.Save(loaded); !errors.Is(err, tenancy.ErrForeignRecord) {
		t.Fatalf("saving another tenant's record = %v", err)
	}
	missing("delete", mineApp.Delete(loaded))

	err = mineApp.RunInTransaction(func(tx core.App) error {
		if _, err := tx.FindRecordById("students", theirs.Id); !errors.Is(err, sql.ErrNoRows) {
			t.Errorf("transaction read = %v", err)
		}
		created := testkit.Create(t, tx, "students", map[string]any{"realName": "学员丙"})
		if created.GetString(tenancy.Field) != tenancy.DefaultID {
			t.Errorf("transaction write tenant = %q", created.GetString(tenancy.Field))
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}

	students, err := app.FindCollectionByNameOrId("students")
	if err != nil {
		t.Fatal(err)
	}
	if err := app.Save(core.NewRecord(students)); err == nil {
		t.Fatal("a business record without a tenant must be rejected")
	}
}

func TestSchemaBackfillsExistingRecords(t *testing.T) {
	app := testkit.NewApp(t)
	before := testkit.Create(t, app, "students", map[string]any{"realName": "老学员"})
	for range 2 {
		testkit.WithTenants(t, app)
	}
	reloaded, err := app.FindRecordById("students", before.Id)
	if err != nil || reloaded.GetString(tenancy.Field) != tenancy.DefaultID {
		t.Fatalf("backfilled student = %v, %v", reloaded, err)
	}
	kanyue, err := app.FindRecordById("tenants", tenancy.DefaultID)
	if err != nil || kanyue.GetString("name") != "看乐艺术" || kanyue.GetString("parent") != "" ||
		!slices.Equal(kanyue.GetStringSlice("joinMethods"), []string{"staff_invite"}) {
		t.Fatalf("default tenant = %v, %v", kanyue, err)
	}
	if plugins, _ := app.FindAllRecords("tenant_plugins"); len(plugins) != 1 || tenancy.PluginState(app, tenancy.DefaultID, tenancy.Payment) != tenancy.Active {
		t.Fatalf("plugins = %v", plugins)
	}
}

func TestEachRunsOncePerActiveTenant(t *testing.T) {
	app := testkit.NewApp(t)
	other := testkit.AddTenant(t, app, "另一家工作室")
	testkit.Create(t, app, "tenants", map[string]any{"name": "已停用", "kind": "coach", "status": "suspended"})
	seen := []string{}
	err := tenancy.Each(app, func(scoped core.App) error {
		seen = append(seen, tenancy.ID(scoped))
		return nil
	})
	slices.Sort(seen)
	want := []string{other, tenancy.DefaultID}
	slices.Sort(want)
	if err != nil || !slices.Equal(seen, want) {
		t.Fatalf("Each visited %v, %v", seen, err)
	}
}

// A plugin is active, winding down (by hand or past expiresAt) or disabled;
// winding down only settles money in flight, and the platform pause stops
// new payments for every tenant without touching settlement.
func TestPluginStatesGrantCapabilities(t *testing.T) {
	app := testkit.NewApp(t)
	other := testkit.AddTenant(t, app, "另一家工作室")
	if state := tenancy.PluginState(app, other, tenancy.Payment); state != tenancy.Disabled {
		t.Fatalf("a new tenant must not have payment, got %s", state)
	}
	plugin, err := app.FindFirstRecordByFilter("tenant_plugins", "tenant={:tenant}", dbx.Params{"tenant": tenancy.DefaultID})
	if err != nil {
		t.Fatal(err)
	}
	expect := func(state string, start, settle bool) {
		t.Helper()
		if got := tenancy.PluginState(app, tenancy.DefaultID, tenancy.Payment); got != state {
			t.Fatalf("state = %s, want %s", got, state)
		}
		if got := tenancy.Allows(app, tenancy.DefaultID, tenancy.Payment, tenancy.StartPayment); got != start {
			t.Fatalf("%s start = %v", state, got)
		}
		if got := tenancy.Allows(app, tenancy.DefaultID, tenancy.Payment, tenancy.SettleMoney); got != settle {
			t.Fatalf("%s settle = %v", state, got)
		}
	}
	save := func(record *core.Record, values map[string]any) {
		t.Helper()
		record.Load(values)
		if err := app.Save(record); err != nil {
			t.Fatal(err)
		}
	}
	expect(tenancy.Active, true, true)
	save(plugin, map[string]any{"expiresAt": time.Now().Add(time.Hour)})
	expect(tenancy.Active, true, true)
	save(plugin, map[string]any{"expiresAt": time.Now().Add(-time.Second)})
	expect(tenancy.WindingDown, false, true)
	save(plugin, map[string]any{"expiresAt": "", "status": tenancy.WindingDown})
	expect(tenancy.WindingDown, false, true)
	save(plugin, map[string]any{"status": tenancy.Active})

	switches, err := app.FindCollectionByNameOrId("platform_plugins")
	if err != nil {
		t.Fatal(err)
	}
	pause := core.NewRecord(switches)
	save(pause, map[string]any{"plugin": tenancy.Payment, "paused": true})
	expect(tenancy.Active, false, true)
	save(pause, map[string]any{"paused": false})
	expect(tenancy.Active, true, true)

	save(plugin, map[string]any{"status": tenancy.Disabled})
	expect(tenancy.Disabled, false, false)
}
