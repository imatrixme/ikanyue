package tenancy

import (
	"database/sql"
	"errors"
	"slices"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/dbutils"
	"github.com/pocketbase/pocketbase/tools/types"
)

// JoinMethods are the ways a student may become a member; each tenant's owner
// picks any combination. Only stored for now, nothing acts on them yet.
var JoinMethods = []string{"scan_join", "scan_approval", "staff_invite"}

// Collections are the business collections owned by a tenant. Platform
// collections (tenants and PocketBase's own) stay without the field;
// tenant_plugins carries it from creation.
var Collections = []string{
	"activities", "appointment_events", "appointment_requests", "booking_conflicts", "booking_policies",
	"class_students", "class_teachers", "classes", "conversion_allocations", "conversion_authorizations",
	"conversion_rules", "course_specs", "credit_batches", "credit_events", "credit_expiry_changes",
	"credit_operations", "credit_types", "credit_version_claims", "offers", "ops_audit_logs", "order_audit",
	"order_claims", "order_refunds", "orders", "outbox_events", "package_grant_lines", "packages", "payment_audit",
	"payment_cases", "payment_claims", "payment_events", "payment_transactions", "point_events", "price_versions",
	"reconciliation_exceptions", "reconciliation_runs", "refund_transactions", "renewal_reminders", "renewal_subscriptions",
	"reward_items", "schedule_claims", "session_classes", "session_credit_allocations", "session_students",
	"session_teachers", "sessions", "student_points", "students", "teacher_availability_overrides",
	"teacher_availability_rules", "teacher_course_offerings", "teacher_credit_events", "teacher_credit_rules",
	"teachers", "venues", "wechat_identities",
}

// ScopedIndexes are unique on business codes and person identifiers, so they
// become unique per tenant. Idempotency keys, order and operation numbers,
// provider event ids, auth fields and indexes over record ids stay global.
var ScopedIndexes = []string{
	"idx_appointment_requests_code", "idx_booking_policies_code_version", "idx_booking_policies_active",
	"idx_classes_code", "idx_course_specs_code", "idx_credit_types_code", "idx_packages_code",
	"idx_sessions_code", "idx_students_sn", "idx_students_cellphone", "idx_teachers_sn", "idx_teachers_cellphone",
}

// EnsureSchema creates the platform collections, the default tenant with the
// payment plugin enabled, and gives every existing business collection a
// required tenant relation backfilled to the default tenant. It is idempotent.
func EnsureSchema(app core.App) error {
	tenants, err := ensurePlatform(app)
	if err != nil {
		return err
	}
	for _, name := range Collections {
		collection, err := app.FindCollectionByNameOrId(name)
		if errors.Is(err, sql.ErrNoRows) {
			continue
		}
		if err != nil {
			return err
		}
		if err := assign(app, collection, tenants); err != nil {
			return err
		}
	}
	return nil
}

// EnsurePlatform creates the tenants and tenant_plugins collections with the
// default tenant and its payment plugin, leaving business collections alone.
func EnsurePlatform(app core.App) error {
	_, err := ensurePlatform(app)
	return err
}

func ensurePlatform(app core.App) (*core.Collection, error) {
	tenants, err := ensureTenants(app)
	if err != nil {
		return nil, err
	}
	return tenants, ensurePlugins(app, tenants)
}

func ensureTenants(app core.App) (*core.Collection, error) {
	tenants, err := app.FindCollectionByNameOrId("tenants")
	if errors.Is(err, sql.ErrNoRows) {
		tenants = core.NewBaseCollection("tenants")
		tenants.Fields.Add(
			&core.TextField{Name: "name", Required: true, Max: 60},
			&core.SelectField{Name: "kind", Required: true, MaxSelect: 1, Values: []string{"studio", "individual", "coach"}},
			&core.SelectField{Name: "status", Required: true, MaxSelect: 1, Values: []string{"active", "suspended"}},
			&core.SelectField{Name: "joinMethods", MaxSelect: len(JoinMethods), Values: JoinMethods},
			&core.AutodateField{Name: "created", OnCreate: true},
			&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
		)
		if err := app.Save(tenants); err != nil {
			return nil, err
		}
		// parent is a hook for a larger organisation later; it carries no behaviour.
		tenants.Fields.Add(&core.RelationField{Name: "parent", CollectionId: tenants.Id, MaxSelect: 1})
		if err := app.Save(tenants); err != nil {
			return nil, err
		}
	} else if err != nil {
		return nil, err
	}
	if _, err := app.FindRecordById(tenants, DefaultID); err == nil || !errors.Is(err, sql.ErrNoRows) {
		return tenants, err
	}
	kanyue := core.NewRecord(tenants)
	kanyue.Id = DefaultID
	kanyue.Load(map[string]any{
		"name":   "看乐艺术",
		"kind":   "studio",
		"status": "active",
		// Staff add students today; scanning a studio code comes with open multi-tenancy.
		"joinMethods": []string{"staff_invite"},
	})
	return tenants, app.Save(kanyue)
}

func ensurePlugins(app core.App, tenants *core.Collection) error {
	plugins, err := app.FindCollectionByNameOrId("tenant_plugins")
	if errors.Is(err, sql.ErrNoRows) {
		plugins = core.NewBaseCollection("tenant_plugins")
		plugins.Fields.Add(
			&core.RelationField{Name: Field, CollectionId: tenants.Id, MaxSelect: 1, Required: true},
			&core.SelectField{Name: "plugin", Required: true, MaxSelect: 1, Values: []string{Payment}},
			&core.SelectField{Name: "status", Required: true, MaxSelect: 1, Values: PluginStatuses},
			&core.DateField{Name: "enabledAt"},
			&core.AutodateField{Name: "created", OnCreate: true},
			&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
		)
		plugins.AddIndex("idx_tenant_plugins_plugin", true, "tenant, plugin", "")
		if err := app.Save(plugins); err != nil {
			return err
		}
	} else if err != nil {
		return err
	}
	// Billing by time came after the first plugin: winding down and the paid-until date.
	if status, ok := plugins.Fields.GetByName("status").(*core.SelectField); ok && !slices.Contains(status.Values, WindingDown) {
		status.Values = PluginStatuses
	}
	if plugins.Fields.GetByName("expiresAt") == nil {
		plugins.Fields.Add(&core.DateField{Name: "expiresAt"})
	}
	if err := app.Save(plugins); err != nil {
		return err
	}
	if err := ensureSwitches(app); err != nil {
		return err
	}
	_, err = app.FindFirstRecordByFilter(plugins, "tenant={:tenant} && plugin={:plugin}",
		dbx.Params{"tenant": DefaultID, "plugin": Payment})
	if err == nil || !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	payment := core.NewRecord(plugins)
	payment.Load(map[string]any{Field: DefaultID, "plugin": Payment, "status": "active", "enabledAt": types.NowDateTime()})
	return app.Save(payment)
}

// ensureSwitches creates platform_plugins, the platform's own switches per
// plugin; paused stops every tenant from starting payments.
func ensureSwitches(app core.App) error {
	_, err := app.FindCollectionByNameOrId("platform_plugins")
	if !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	switches := core.NewBaseCollection("platform_plugins")
	switches.Fields.Add(
		&core.SelectField{Name: "plugin", Required: true, MaxSelect: 1, Values: []string{Payment}},
		&core.BoolField{Name: "paused"},
		&core.TextField{Name: "note", Max: 200},
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)
	switches.AddIndex("idx_platform_plugins_plugin", true, "plugin", "")
	return app.Save(switches)
}

// assign adds the tenant relation, backfills existing rows to the default
// tenant and makes the collection's business codes unique per tenant.
func assign(app core.App, collection *core.Collection, tenants *core.Collection) error {
	if collection.Fields.GetByName(Field) == nil {
		collection.Fields.Add(&core.RelationField{Name: Field, CollectionId: tenants.Id, MaxSelect: 1, Required: true})
	}
	for i, raw := range collection.Indexes {
		index := dbutils.ParseIndex(raw)
		if !slices.Contains(ScopedIndexes, index.IndexName) || (len(index.Columns) > 0 && index.Columns[0].Name == Field) {
			continue
		}
		index.Columns = append([]dbutils.IndexColumn{{Name: Field}}, index.Columns...)
		collection.Indexes[i] = index.Build()
	}
	if err := app.Save(collection); err != nil {
		return err
	}
	_, err := app.DB().NewQuery("UPDATE {{" + collection.Name + "}} SET [[" + Field + "]]={:tenant} WHERE [[" + Field + "]]='' OR [[" + Field + "]] IS NULL").
		Bind(map[string]any{"tenant": DefaultID}).Execute()
	return err
}
