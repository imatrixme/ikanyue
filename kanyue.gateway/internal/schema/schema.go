// Package schema owns the gateway's configuration collections. The gateway is
// the only writer of its data dir, so its migrations run on serve like
// PocketBase's own. Every collection is superuser-only.
package schema

import (
	"github.com/pocketbase/pocketbase/core"
)

const (
	Sites          = "sites"
	Services       = "services"
	Instances      = "instances"
	Operations     = "operations"
	Routes         = "routes"
	ConfigVersions = "config_versions"
	AuditLogs      = "audit_logs"
)

// Audited are the collections whose admin edits land in the audit log.
var Audited = []string{Sites, Services, Instances, Operations, Routes}

func init() {
	core.AppMigrations.Register(initial, nil, "gateway_0001_initial")
}

func initial(txApp core.App) error {
	sites := core.NewBaseCollection(Sites)
	sites.Fields.Add(
		&core.TextField{Name: "name", Required: true, Max: 60},
		&core.JSONField{Name: "hosts", Required: true, MaxSize: 4096},
	)
	sites.AddIndex("idx_sites_name", true, "name", "")
	withDates(sites)

	services := core.NewBaseCollection(Services)
	services.Fields.Add(
		&core.TextField{Name: "name", Required: true, Max: 63, Pattern: `^[a-z0-9][a-z0-9._-]*$`},
		&core.SelectField{Name: "discovery", Required: true, MaxSelect: 1, Values: []string{"registry", "dns", "static"}},
		&core.TextField{Name: "dnsName", Max: 253},
		&core.NumberField{Name: "dnsPort", OnlyInt: true, Min: ptr(0.0), Max: ptr(65535.0)},
		&core.TextField{Name: "dnsStage", Max: 20},
		&core.NumberField{Name: "headerTimeoutMs", OnlyInt: true, Min: ptr(0.0)},
		&core.TextField{Name: "manifestPath", Max: 200},
		&core.TextField{Name: "manifestHash", Max: 64},
		&core.TextField{Name: "manifestError", Max: 500},
	)
	services.AddIndex("idx_services_name", true, "name", "")
	withDates(services)
	if err := saveAll(txApp, sites, services); err != nil {
		return err
	}

	instances := core.NewBaseCollection(Instances)
	instances.Fields.Add(
		&core.RelationField{Name: "service", Required: true, CollectionId: services.Id, MaxSelect: 1, CascadeDelete: true},
		&core.TextField{Name: "address", Required: true, Max: 300},
		&core.TextField{Name: "stage", Required: true, Max: 20},
		&core.NumberField{Name: "weight", OnlyInt: true, Min: ptr(0.0)},
		&core.SelectField{Name: "source", Required: true, MaxSelect: 1, Values: []string{"registry", "dns", "static"}},
		&core.SelectField{Name: "status", Required: true, MaxSelect: 1, Values: []string{"online", "offline", "drained"}},
		// Static entries are typed by hand, so they route only after a second, audited confirmation.
		&core.BoolField{Name: "confirmed"},
		&core.DateField{Name: "lastSeen"},
		&core.TextField{Name: "version", Max: 100},
		&core.TextField{Name: "manifestHash", Max: 64},
	)
	instances.AddIndex("idx_instances_service_address", true, "service, address", "")
	withDates(instances)

	operations := core.NewBaseCollection(Operations)
	operations.Fields.Add(
		&core.RelationField{Name: "service", Required: true, CollectionId: services.Id, MaxSelect: 1, CascadeDelete: true},
		&core.TextField{Name: "method", Max: 10},
		&core.TextField{Name: "path", Required: true, Max: 500},
		&core.TextField{Name: "module", Max: 60},
		&core.TextField{Name: "auth", Max: 30},
		&core.BoolField{Name: "idempotent"},
		// pending: discovered, not yet published; removed: gone from the latest manifest.
		&core.SelectField{Name: "status", Required: true, MaxSelect: 1, Values: []string{"pending", "active", "removed"}},
	)
	operations.AddIndex("idx_operations_service_method_path", true, "service, method, path", "")
	withDates(operations)
	if err := saveAll(txApp, instances, operations); err != nil {
		return err
	}

	routes := core.NewBaseCollection(Routes)
	routes.Fields.Add(
		&core.TextField{Name: "name", Required: true, Max: 60},
		&core.RelationField{Name: "site", Required: true, CollectionId: sites.Id, MaxSelect: 1},
		&core.RelationField{Name: "service", Required: true, CollectionId: services.Id, MaxSelect: 1},
		// Empty means every discovered operation of the service.
		&core.RelationField{Name: "operations", CollectionId: operations.Id, MaxSelect: 1000},
		&core.BoolField{Name: "enabled"},
	)
	routes.AddIndex("idx_routes_name", true, "name", "")
	withDates(routes)

	versions := core.NewBaseCollection(ConfigVersions)
	versions.Fields.Add(
		&core.NumberField{Name: "version", Required: true, OnlyInt: true, Min: ptr(1.0)},
		&core.JSONField{Name: "config", Required: true, MaxSize: 16 << 20},
		&core.TextField{Name: "note", Max: 500},
		&core.TextField{Name: "publishedBy", Max: 200},
		&core.NumberField{Name: "rollbackOf", OnlyInt: true},
	)
	versions.AddIndex("idx_config_versions_version", true, "version", "")
	withDates(versions)

	audit := core.NewBaseCollection(AuditLogs)
	audit.Fields.Add(
		&core.TextField{Name: "actor", Max: 200},
		&core.TextField{Name: "action", Required: true, Max: 60},
		&core.TextField{Name: "resource", Max: 60},
		&core.TextField{Name: "resourceId", Max: 60},
		&core.JSONField{Name: "detail", MaxSize: 1 << 20},
	)
	audit.AddIndex("idx_audit_logs_created", false, "created", "")
	withDates(audit)
	return saveAll(txApp, routes, versions, audit)
}

func withDates(collection *core.Collection) {
	collection.Fields.Add(
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)
}

func saveAll(txApp core.App, collections ...*core.Collection) error {
	for _, collection := range collections {
		if err := txApp.Save(collection); err != nil {
			return err
		}
	}
	return nil
}

func ptr[T any](value T) *T { return &value }
