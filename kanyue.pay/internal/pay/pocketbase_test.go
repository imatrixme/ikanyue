package pay

import (
	"reflect"
	"testing"

	"github.com/pocketbase/pocketbase/core"
)

// Ports of kanyue.pay test/pocketbase.test.ts. The store is embedded now, so a
// restart is a fresh app over the same data directory, and the suite always runs.

// openApp boots an app over dir with the pay schema applied; closing it is a process stop.
func openApp(t *testing.T, dir string) core.App {
	t.Helper()
	app := core.NewBaseApp(core.BaseAppConfig{DataDir: dir})
	ok(t, app.Bootstrap())
	must(core.NewMigrationsRunner(app, migrationList).Up())
	t.Cleanup(func() { app.ResetBootstrapState() })
	return app
}

func restart(t *testing.T, app core.App) core.App {
	t.Helper()
	dir := app.DataDir()
	ok(t, app.ResetBootstrapState())
	return openApp(t, dir)
}

func ids(rows []Row) []string {
	result := []string{}
	for _, row := range rows {
		result = append(result, row.ID)
	}
	return result
}

// data filters match booleans, strings and missing keys like the memory store
func TestPocketBaseFiltersMatchMemoryStore(t *testing.T) {
	store := PocketBaseStore{App: openApp(t, t.TempDir())}
	row := func(id string, data map[string]any) Mutation { return insert(fresh(id, "provider", "filters", data)) }
	ok(t, store.Commit([]Mutation{row("filterunapplied", map[string]any{"status": "succeeded"}),
		row("filterapplied00", map[string]any{"status": "succeeded", "applied": true}),
		row("filterpending00", map[string]any{"status": "pending", "applied": false})}))
	open := must(store.List("provider", "filters", Where{"applied": Not{true}, "status": Not{"pending"}}))
	if !reflect.DeepEqual(ids(open), []string{"filterunapplied"}) {
		t.Fatalf("open = %v", ids(open))
	}
	if unapplied := must(store.List("provider", "filters", Where{"applied": false})); !reflect.DeepEqual(ids(unapplied), []string{"filterpending00"}) {
		t.Fatalf("applied=false = %v", ids(unapplied))
	}
	_, err := store.List("provider", "filters", Where{"data.x": true})
	wantCode(t, err, "INVALID_FILTER")
}

// A commit is all-or-nothing and a stale version is a conflict, as in the memory store.
func TestPocketBaseCommitIsAtomic(t *testing.T) {
	store := PocketBaseStore{App: openApp(t, t.TempDir())}
	row := fresh(recordID("one"), "payment", "kanyue", map[string]any{"amount": 1})
	other := fresh(recordID("two"), "payment", "kanyue", map[string]any{"amount": 2})
	wantCode(t, store.Commit([]Mutation{insert(other), insert(row), insert(row)}), "CONCURRENT_CHANGE")
	if must(store.Get(other.ID)) != nil {
		t.Fatal("partial commit")
	}
	ok(t, store.Commit([]Mutation{insert(row)}))
	wantCode(t, store.Commit([]Mutation{insert(row)}), "CONCURRENT_CHANGE")
	ok(t, store.Commit([]Mutation{update(next(row, map[string]any{"amount": 3}))}))
	wantCode(t, store.Commit([]Mutation{update(next(row, map[string]any{"amount": 4}))}), "CONCURRENT_CHANGE")
	if got := must(store.Get(row.ID)); got.Version != 2 || num(got.Data, "amount") != 3 {
		t.Fatalf("row = %v", got)
	}
}

// concurrent creation/refunds survive an actual PocketBase process restart
func TestPocketBaseConcurrencySurvivesRestart(t *testing.T) {
	app := openApp(t, t.TempDir())
	g := NewGateway(PocketBaseStore{App: app}, "contract")
	input := order("persistent-order", 10000)
	attempts := make([]Row, 2)
	errs := concurrently(
		func() (err error) { attempts[0], err = g.CreatePayment(input, "one"); return },
		func() (err error) { attempts[1], err = g.CreatePayment(input, "one"); return })
	if succeeded(errs) != 2 || attempts[0].ID != attempts[1].ID {
		t.Fatalf("attempts = %v %v", attempts, errs)
	}
	id := attempts[0].ID
	must(g.Observe(id, map[string]any{"status": "succeeded"}))
	must(g.Poll())
	refundWith := func(reference string) func() error {
		return func() error {
			_, err := g.CreateRefund(map[string]any{"reference": reference, "paymentId": id, "amount": 7000}, reference)
			return err
		}
	}
	if errs := concurrently(refundWith("refund-1"), refundWith("refund-2")); succeeded(errs) != 1 {
		t.Fatalf("refunds = %v", errs)
	}
	restarted := NewGateway(PocketBaseStore{App: restart(t, app)}, "contract")
	if num(must(restarted.Owned(id, "payment")).Data, "reserved") != 7000 || count(eventTypes(t, restarted), "payment.succeeded") != 1 {
		t.Fatal("state lost across restart")
	}
	if result := must(restarted.Poll()); len(result.Errors) != 0 {
		t.Fatalf("poll = %v", result)
	}
	if len(must(restarted.Store.List("refund", "contract", nil))) != 1 {
		t.Fatal("refund count")
	}
}

// WeChat HTTP state survives PB restart and new signing keys without another refund
func TestPocketBaseWechatStateSurvivesRestart(t *testing.T) {
	app := openApp(t, t.TempDir())
	wechat := NewMockWechatGateway(PocketBaseStore{App: app}, "wechat-contract", testKeys(), nil)
	payment := must(wechat.CreatePayment(map[string]any{"reference": "wechat-order", "amount": 10000, "currency": "CNY"}, "wx"))
	must(wechat.Observe(payment.ID, map[string]any{"status": "succeeded"}))
	must(wechat.Poll())
	peer(t, wechat).Fault(FaultTimeoutAfter, "/v3/refund/domestic/refunds")
	input := map[string]any{"paymentId": payment.ID, "reference": "wechat-refund", "amount": 7000}
	_, err := wechat.CreateRefund(input, "wr")
	wantCode(t, err, "MOCK_RESPONSE_LOST")
	// New process, new ephemeral merchant and platform keys.
	recovered := NewMockWechatGateway(PocketBaseStore{App: restart(t, app)}, "wechat-contract", MockCredentials(), nil)
	refund := must(recovered.CreateRefund(input, "wr"))
	if num(must(recovered.Owned(payment.ID, "payment")).Data, "reserved") != 7000 {
		t.Fatal("reservation lost")
	}
	must(recovered.Observe(refund.ID, map[string]any{"status": "succeeded"}))
	deliver(t, recovered, refund.ID)
	if num(must(recovered.Owned(payment.ID, "payment")).Data, "refunded") != 7000 ||
		len(must(recovered.Store.List("wechat_mock", "wechat-contract", nil))) != 2 ||
		count(eventTypes(t, recovered.Gateway), "refund.succeeded") != 1 {
		t.Fatal("refund applied more than once or not at all")
	}
}

// The migration adopts a pay_entities created by the TypeScript bootstrap and widens its kinds.
func TestMigrationAdoptsLegacySchema(t *testing.T) {
	app := core.NewBaseApp(core.BaseAppConfig{DataDir: t.TempDir()})
	ok(t, app.Bootstrap())
	t.Cleanup(func() { app.ResetBootstrapState() })
	legacy := core.NewBaseCollection(entities)
	legacy.Fields.Add(&core.SelectField{Name: "kind", Required: true, MaxSelect: 1, Values: []string{"payment", "refund", "event", "provider", "reconciliation"}},
		&core.TextField{Name: "owner", Required: true}, &core.NumberField{Name: "version", Required: true},
		&core.JSONField{Name: "data", Required: true}, &core.AutodateField{Name: "created", OnCreate: true})
	ok(t, app.Save(legacy))
	if pending := must(pendingMigrations(app)); len(pending) != 1 {
		t.Fatalf("pending = %v", pending)
	}
	must(core.NewMigrationsRunner(app, migrationList).Up())
	kind := must(app.FindCollectionByNameOrId(entities)).Fields.GetByName("kind").(*core.SelectField)
	if !reflect.DeepEqual(kind.Values, append([]string{"payment", "refund", "event", "provider", "reconciliation"}, Kinds[5:]...)) {
		t.Fatalf("kinds = %v", kind.Values)
	}
	if pending := must(pendingMigrations(app)); len(pending) != 0 {
		t.Fatalf("pending = %v", pending)
	}
	ok(t, PocketBaseStore{App: app}.Commit([]Mutation{insert(fresh(recordID("w"), "wechat_mock", "kanyue", map[string]any{"state": "NOTPAY"}))}))
}
