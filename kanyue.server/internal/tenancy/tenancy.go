// Package tenancy keeps every business record inside one tenant. A scoped App
// limits PocketBase record queries to the tenant and stamps it on saves, so
// module code keeps calling e.App as before. Collections without a tenant
// field (platform and PocketBase system collections) pass through unchanged.
package tenancy

import (
	"context"
	"database/sql"
	"errors"
	"slices"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/inflector"
)

const (
	// Field is the relation every business collection carries.
	Field = "tenant"
	// DefaultID is 看乐艺术, the only tenant while multi-tenancy stays hidden.
	DefaultID = "tenantkanyue001"
	// Payment is the plugin covering package checkout, orders, refunds and reconciliation.
	Payment = "payment"
)

const param = "__tenant"

// ErrForeignRecord rejects a write to a record of another tenant.
var ErrForeignRecord = errors.New("tenancy: record belongs to another tenant")

// App is a core.App limited to one tenant.
type App struct {
	core.App
	tenant string
}

// Scope limits app to tenant; scoping a scoped app replaces its tenant.
func Scope(app core.App, tenant string) core.App {
	if scoped, ok := app.(*App); ok {
		app = scoped.App
	}
	return &App{App: app, tenant: tenant}
}

// ID is the tenant app is scoped to, or "" for an unscoped app.
func ID(app core.App) string {
	if scoped, ok := app.(*App); ok {
		return scoped.tenant
	}
	return ""
}

// Resolve is the single place a request's tenant is decided. While
// multi-tenancy stays hidden every request belongs to the default tenant.
func Resolve(*core.RequestEvent) string {
	return DefaultID
}

// Each runs fn once per active tenant with that tenant's scope; a failing
// tenant does not stop the others.
func Each(app core.App, fn func(scoped core.App) error) error {
	tenants, err := app.FindAllRecords("tenants", dbx.HashExp{"status": "active"})
	if err != nil {
		return err
	}
	var errs []error
	for _, tenant := range tenants {
		if err := fn(Scope(app, tenant.Id)); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

// Job turns a scheduled job's body into a cron func that runs it once per active
// tenant; the body logs its own failures.
func Job(app core.App, name string, fn func(scoped core.App)) func() {
	return func() {
		err := Each(app, func(scoped core.App) error {
			fn(scoped)
			return nil
		})
		if err != nil {
			app.Logger().Error("scheduled job could not list tenants", "job", name, "error", err.Error())
		}
	}
}

// PluginEnabled reports whether tenant has plugin active.
func PluginEnabled(app core.App, tenant, plugin string) bool {
	_, err := app.FindFirstRecordByFilter("tenant_plugins", "tenant={:tenant} && plugin={:plugin} && status='active'",
		dbx.Params{"tenant": tenant, "plugin": plugin})
	return err == nil
}

// owned returns the collection when it carries the tenant field.
func (a *App) owned(collectionModelOrIdentifier any) *core.Collection {
	var collection *core.Collection
	switch value := collectionModelOrIdentifier.(type) {
	case *core.Collection:
		collection = value
	case string:
		collection, _ = a.App.FindCachedCollectionByNameOrId(value)
	}
	if collection == nil || collection.Fields.GetByName(Field) == nil {
		return nil
	}
	return collection
}

func (a *App) where(collection *core.Collection) func(q *dbx.SelectQuery) error {
	return func(q *dbx.SelectQuery) error {
		q.AndWhere(dbx.HashExp{collection.Name + "." + Field: a.tenant})
		return nil
	}
}

func (a *App) RecordQuery(collectionModelOrIdentifier any) *dbx.SelectQuery {
	query := a.App.RecordQuery(collectionModelOrIdentifier)
	if collection := a.owned(collectionModelOrIdentifier); collection != nil {
		_ = a.where(collection)(query)
	}
	return query
}

func (a *App) FindRecordById(collectionModelOrIdentifier any, recordId string, optFilters ...func(q *dbx.SelectQuery) error) (*core.Record, error) {
	if collection := a.owned(collectionModelOrIdentifier); collection != nil {
		optFilters = append(optFilters, a.where(collection))
	}
	return a.App.FindRecordById(collectionModelOrIdentifier, recordId, optFilters...)
}

func (a *App) FindRecordsByIds(collectionModelOrIdentifier any, recordIds []string, optFilters ...func(q *dbx.SelectQuery) error) ([]*core.Record, error) {
	if collection := a.owned(collectionModelOrIdentifier); collection != nil {
		optFilters = append(optFilters, a.where(collection))
	}
	return a.App.FindRecordsByIds(collectionModelOrIdentifier, recordIds, optFilters...)
}

func (a *App) FindAllRecords(collectionModelOrIdentifier any, exprs ...dbx.Expression) ([]*core.Record, error) {
	if collection := a.owned(collectionModelOrIdentifier); collection != nil {
		exprs = append(exprs, dbx.HashExp{collection.Name + "." + Field: a.tenant})
	}
	return a.App.FindAllRecords(collectionModelOrIdentifier, exprs...)
}

func (a *App) CountRecords(collectionModelOrIdentifier any, exprs ...dbx.Expression) (int64, error) {
	if collection := a.owned(collectionModelOrIdentifier); collection != nil {
		exprs = append(exprs, dbx.HashExp{collection.Name + "." + Field: a.tenant})
	}
	return a.App.CountRecords(collectionModelOrIdentifier, exprs...)
}

func (a *App) FindFirstRecordByData(collectionModelOrIdentifier any, key string, value any) (*core.Record, error) {
	record := &core.Record{}
	err := a.RecordQuery(collectionModelOrIdentifier).
		AndWhere(dbx.HashExp{inflector.Columnify(key): value}).
		Limit(1).
		One(record)
	if err != nil {
		return nil, err
	}
	return record, nil
}

func (a *App) FindRecordsByFilter(collectionModelOrIdentifier any, filter string, sort string, limit int, offset int, params ...dbx.Params) ([]*core.Record, error) {
	if a.owned(collectionModelOrIdentifier) != nil {
		filter, params = a.filter(filter, params)
	}
	return a.App.FindRecordsByFilter(collectionModelOrIdentifier, filter, sort, limit, offset, params...)
}

func (a *App) FindFirstRecordByFilter(collectionModelOrIdentifier any, filter string, params ...dbx.Params) (*core.Record, error) {
	if a.owned(collectionModelOrIdentifier) != nil {
		filter, params = a.filter(filter, params)
	}
	return a.App.FindFirstRecordByFilter(collectionModelOrIdentifier, filter, params...)
}

// filter wraps a caller's filter so it can only narrow the tenant's records.
func (a *App) filter(filter string, params []dbx.Params) (string, []dbx.Params) {
	scoped := Field + "={:" + param + "}"
	if filter != "" {
		scoped += " && (" + filter + ")"
	}
	return scoped, append(slices.Clone(params), dbx.Params{param: a.tenant})
}

// stamp writes the tenant on new records and refuses records of another tenant;
// a tenant set by a client on the record is overwritten.
func (a *App) stamp(model core.Model) error {
	record, ok := model.(*core.Record)
	if !ok || a.owned(record.Collection()) == nil {
		return nil
	}
	if !record.IsNew() && owner(record) != a.tenant {
		return ErrForeignRecord
	}
	record.Set(Field, a.tenant)
	return nil
}

func (a *App) Save(model core.Model) error {
	if err := a.stamp(model); err != nil {
		return err
	}
	return a.App.Save(model)
}

func (a *App) SaveWithContext(ctx context.Context, model core.Model) error {
	if err := a.stamp(model); err != nil {
		return err
	}
	return a.App.SaveWithContext(ctx, model)
}

func (a *App) SaveNoValidate(model core.Model) error {
	if err := a.stamp(model); err != nil {
		return err
	}
	return a.App.SaveNoValidate(model)
}

func (a *App) SaveNoValidateWithContext(ctx context.Context, model core.Model) error {
	if err := a.stamp(model); err != nil {
		return err
	}
	return a.App.SaveNoValidateWithContext(ctx, model)
}

// owner is the tenant a stored record belongs to: its loaded value, or for a
// record created in this process (PocketBase keeps no original after a create)
// the tenant stamp wrote.
func owner(record *core.Record) string {
	if loaded := record.Original().GetString(Field); loaded != "" {
		return loaded
	}
	return record.GetString(Field)
}

// guard treats another tenant's record as missing.
func (a *App) guard(model core.Model) error {
	record, ok := model.(*core.Record)
	if ok && a.owned(record.Collection()) != nil && owner(record) != a.tenant {
		return sql.ErrNoRows
	}
	return nil
}

func (a *App) Delete(model core.Model) error {
	if err := a.guard(model); err != nil {
		return err
	}
	return a.App.Delete(model)
}

func (a *App) DeleteWithContext(ctx context.Context, model core.Model) error {
	if err := a.guard(model); err != nil {
		return err
	}
	return a.App.DeleteWithContext(ctx, model)
}

func (a *App) RunInTransaction(fn func(txApp core.App) error) error {
	return a.App.RunInTransaction(func(txApp core.App) error {
		return fn(Scope(txApp, a.tenant))
	})
}
