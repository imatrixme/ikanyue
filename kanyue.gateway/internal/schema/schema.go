// Package schema owns the gateway's configuration collections. The gateway is
// the only writer of its data dir, so its migrations run on serve like
// PocketBase's own. Every collection is superuser-only.
package schema

import (
	"github.com/pocketbase/pocketbase/core"

	"kanyue.gateway/internal/policy"
)

const (
	Sites          = "sites"
	Services       = "services"
	Instances      = "instances"
	Operations     = "operations"
	Routes         = "routes"
	ConfigVersions = "config_versions"
	AuditLogs      = "audit_logs"
	PluginBindings = "plugin_bindings"
	Consumers      = "consumers"
	Secrets        = "secrets"
	SuperuserTOTP  = "superuser_totp"
	Exporters      = "exporters"
	AlertChannels  = "alert_channels"
	AlertRules     = "alert_rules"
	APIGroups      = "api_groups"
	GroupDomains   = "group_domains"
	APIs           = "apis"
	PolicySets     = "policy_sets"
	Grants         = "grants"
	Releases       = "releases"
	StageVersions  = "stage_versions"
)

// Baseline is the built-in policy set every API inherits first.
const Baseline = "baseline"

// Stages are the environments APIs are released to.
var Stages = policy.Stages

// Audited are the collections whose admin edits land in the audit log.
var Audited = []string{Services, Instances, Operations, Consumers, Secrets, Exporters, AlertChannels, AlertRules,
	APIGroups, GroupDomains, APIs, PolicySets, Grants}

// Legacy are the collections of the site and route model; they stay readable
// after the migration to API groups, and the admin API refuses writes to them.
var Legacy = []string{Sites, Routes, PluginBindings, ConfigVersions}

// AppendOnly are written only by the control plane and never changed afterwards.
var AppendOnly = []string{AuditLogs, Releases, StageVersions}

func init() {
	core.AppMigrations.Register(initial, nil, "gateway_0001_initial")
	core.AppMigrations.Register(policies, nil, "gateway_0002_policies")
	core.AppMigrations.Register(console, nil, "gateway_0003_console")
	core.AppMigrations.Register(observability, nil, "gateway_0004_observability")
	core.AppMigrations.Register(groups, nil, "gateway_0005_groups")
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
		// Exactly the operations the route exposes; discovery never adds to it.
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

// policies adds plugins, consumers, secrets, load balancing, health checks and timeouts.
func policies(txApp core.App) error {
	services, err := txApp.FindCollectionByNameOrId(Services)
	if err != nil {
		return err
	}
	services.Fields.Add(
		&core.SelectField{Name: "balancer", MaxSelect: 1, Values: []string{"round-robin", "least-inflight", "hash"}},
		// user, ip, header:<name> or cookie:<name>
		&core.TextField{Name: "hashBy", Max: 120, Pattern: `^(user|ip|header:.+|cookie:.+)?$`},
		&core.NumberField{Name: "timeoutMs", OnlyInt: true, Min: ptr(0.0)},
		&core.NumberField{Name: "idleTimeoutMs", OnlyInt: true, Min: ptr(0.0)},
		&core.TextField{Name: "healthPath", Max: 200, Pattern: `^(/.*)?$`},
		&core.NumberField{Name: "healthIntervalSeconds", OnlyInt: true, Min: ptr(0.0), Max: ptr(3600.0)},
		&core.NumberField{Name: "healthThreshold", OnlyInt: true, Min: ptr(0.0), Max: ptr(20.0)},
		&core.NumberField{Name: "passiveFailures", OnlyInt: true, Min: ptr(0.0), Max: ptr(100.0)},
	)
	routes, err := txApp.FindCollectionByNameOrId(Routes)
	if err != nil {
		return err
	}
	routes.Fields.Add(
		&core.NumberField{Name: "headerTimeoutMs", OnlyInt: true, Min: ptr(0.0)},
		&core.NumberField{Name: "timeoutMs", OnlyInt: true, Min: ptr(0.0)},
		&core.NumberField{Name: "idleTimeoutMs", OnlyInt: true, Min: ptr(0.0)},
	)
	if err := saveAll(txApp, services, routes); err != nil {
		return err
	}

	// Secret values are sealed with the --encryptionEnv key before they are stored,
	// and hidden from every API response; only the fingerprint is shown.
	consumers := core.NewBaseCollection(Consumers)
	consumers.Fields.Add(
		&core.TextField{Name: "name", Required: true, Max: 60, Pattern: `^[A-Za-z0-9][A-Za-z0-9._-]*$`},
		&core.TextField{Name: "appKey", Required: true, Min: 8, Max: 64, Pattern: `^[A-Za-z0-9_-]+$`},
		&core.TextField{Name: "appSecret", Required: true, Hidden: true, Max: 2000},
		&core.TextField{Name: "fingerprint", Max: 16},
		&core.TextField{Name: "note", Max: 500},
		&core.BoolField{Name: "enabled"},
	)
	consumers.AddIndex("idx_consumers_name", true, "name", "")
	consumers.AddIndex("idx_consumers_app_key", true, "appKey", "")
	withDates(consumers)

	secrets := core.NewBaseCollection(Secrets)
	secrets.Fields.Add(
		&core.TextField{Name: "name", Required: true, Max: 60, Pattern: `^[a-z0-9][a-z0-9._-]*$`},
		&core.TextField{Name: "value", Required: true, Hidden: true, Max: 4000},
		&core.TextField{Name: "fingerprint", Max: 16},
		&core.TextField{Name: "note", Max: 500},
	)
	secrets.AddIndex("idx_secrets_name", true, "name", "")
	withDates(secrets)
	if err := saveAll(txApp, consumers, secrets); err != nil {
		return err
	}

	sites, err := txApp.FindCollectionByNameOrId(Sites)
	if err != nil {
		return err
	}
	bindings := core.NewBaseCollection(PluginBindings)
	bindings.Fields.Add(
		&core.TextField{Name: "plugin", Required: true, Max: 60},
		&core.SelectField{Name: "scope", Required: true, MaxSelect: 1, Values: []string{"global", "site", "route", "consumer"}},
		&core.RelationField{Name: "site", CollectionId: sites.Id, MaxSelect: 1, CascadeDelete: true},
		&core.RelationField{Name: "route", CollectionId: routes.Id, MaxSelect: 1, CascadeDelete: true},
		&core.RelationField{Name: "consumer", CollectionId: consumers.Id, MaxSelect: 1, CascadeDelete: true},
		&core.JSONField{Name: "config", MaxSize: 1 << 20},
		// 0 keeps the plugin's own priority.
		&core.NumberField{Name: "priority", OnlyInt: true},
		// A disabled binding switches an inherited plugin off at its level.
		&core.BoolField{Name: "enabled"},
		&core.TextField{Name: "note", Max: 500},
	)
	withDates(bindings)
	return saveAll(txApp, bindings)
}

// console makes superuser sign-in two-step: password, then a one-time code whose
// value the gateway checks against the superuser's enrolled TOTP secret (the
// emailed code is never sent).
func console(txApp core.App) error {
	superusers, err := txApp.FindCollectionByNameOrId(core.CollectionNameSuperusers)
	if err != nil {
		return err
	}
	superusers.MFA.Enabled = true
	superusers.MFA.Duration = 600
	superusers.OTP.Enabled = true
	superusers.OTP.Duration = 300
	superusers.OTP.Length = 8

	totp := core.NewBaseCollection(SuperuserTOTP)
	totp.Fields.Add(
		&core.RelationField{Name: "superuser", Required: true, CollectionId: superusers.Id, MaxSelect: 1, CascadeDelete: true},
		&core.TextField{Name: "secret", Required: true, Hidden: true, Max: 500},
		&core.TextField{Name: "fingerprint", Max: 16},
		// lastStep refuses a code twice within its 30 second window.
		&core.NumberField{Name: "lastStep", OnlyInt: true},
	)
	totp.AddIndex("idx_superuser_totp_superuser", true, "superuser", "")
	withDates(totp)
	return saveAll(txApp, superusers, totp)
}

// AlertTemplates are the conditions an alert rule can watch.
var AlertTemplates = []string{
	"5xx-ratio", "p95-latency", "no-healthy-instance", "breaker-open", "outbound-failures", "outbox-dead-letters",
	"dropped-logs", "export-failing", "backup-overdue", "certificate-expiry", "operation-removed",
}

// observability adds log exporters, alert channels and alert rules. Their
// secrets (export password or token, webhook signing key) are sealed like
// consumer secrets.
func observability(txApp core.App) error {
	exporters := core.NewBaseCollection(Exporters)
	exporters.Fields.Add(
		&core.TextField{Name: "name", Required: true, Max: 60},
		// JSON lines over HTTP, e.g. http://127.0.0.1:9428/insert/jsonline for VictoriaLogs.
		&core.URLField{Name: "url", Required: true},
		&core.SelectField{Name: "auth", MaxSelect: 1, Values: []string{"none", "basic", "bearer"}},
		&core.TextField{Name: "username", Max: 200},
		&core.TextField{Name: "secret", Hidden: true, Max: 2000},
		&core.TextField{Name: "fingerprint", Max: 16},
		&core.TextField{Name: "streamFields", Max: 200, Pattern: `^[A-Za-z0-9_,]*$`},
		&core.NumberField{Name: "sample", Min: ptr(0.0), Max: ptr(1.0)},
		&core.BoolField{Name: "onlyErrors"},
		// Enabling runs a connection test; a failing target cannot be enabled.
		&core.BoolField{Name: "enabled"},
		&core.DateField{Name: "probedAt"},
		&core.TextField{Name: "probeError", Max: 500},
	)
	exporters.AddIndex("idx_exporters_name", true, "name", "")
	withDates(exporters)

	channels := core.NewBaseCollection(AlertChannels)
	channels.Fields.Add(
		&core.TextField{Name: "name", Required: true, Max: 60},
		// webhook posts signed JSON; wecom, feishu and dingtalk post their bot message formats.
		&core.SelectField{Name: "kind", Required: true, MaxSelect: 1, Values: []string{"webhook", "wecom", "feishu", "dingtalk"}},
		&core.URLField{Name: "url", Required: true},
		&core.TextField{Name: "secret", Hidden: true, Max: 500},
		&core.TextField{Name: "fingerprint", Max: 16},
		&core.BoolField{Name: "enabled"},
	)
	channels.AddIndex("idx_alert_channels_name", true, "name", "")
	withDates(channels)
	if err := saveAll(txApp, exporters, channels); err != nil {
		return err
	}

	rules := core.NewBaseCollection(AlertRules)
	rules.Fields.Add(
		&core.TextField{Name: "name", Required: true, Max: 60},
		&core.SelectField{Name: "template", Required: true, MaxSelect: 1, Values: AlertTemplates},
		// What the template watches: a route, service or dependency name, or certificate file paths; empty is all.
		&core.TextField{Name: "target", Max: 500},
		&core.NumberField{Name: "threshold"},
		// The condition must hold this long before the rule fires.
		&core.NumberField{Name: "forMinutes", OnlyInt: true, Min: ptr(0.0), Max: ptr(1440.0)},
		&core.RelationField{Name: "channels", CollectionId: channels.Id, MaxSelect: 10},
		&core.BoolField{Name: "enabled"},
	)
	rules.AddIndex("idx_alert_rules_name", true, "name", "")
	withDates(rules)
	return saveAll(txApp, rules)
}

// groups adds API groups bound to domains, APIs built from selected operations,
// policy sets with the built-in baseline, application grants, and per-environment
// releases; audit entries gain before, after and diff.
func groups(txApp core.App) error {
	sets := core.NewBaseCollection(PolicySets)
	sets.Fields.Add(
		&core.TextField{Name: "name", Required: true, Max: 60, Pattern: `^[a-z0-9][a-z0-9._-]*$`},
		// Items: plugin, config, priority, stages, locked, disabled.
		&core.JSONField{Name: "items", MaxSize: 1 << 20},
		&core.TextField{Name: "note", Max: 500},
	)
	sets.AddIndex("idx_policy_sets_name", true, "name", "")
	withDates(sets)
	if err := saveAll(txApp, sets); err != nil {
		return err
	}
	groups := core.NewBaseCollection(APIGroups)
	groups.Fields.Add(
		&core.TextField{Name: "name", Required: true, Max: 60, Pattern: `^[a-z0-9][a-z0-9._-]*$`},
		&core.RelationField{Name: "defaultPolicySet", CollectionId: sets.Id, MaxSelect: 1},
		&core.TextField{Name: "note", Max: 500},
	)
	groups.AddIndex("idx_api_groups_name", true, "name", "")
	withDates(groups)
	if err := saveAll(txApp, groups); err != nil {
		return err
	}

	domains := core.NewBaseCollection(GroupDomains)
	domains.Fields.Add(
		&core.RelationField{Name: "group", Required: true, CollectionId: groups.Id, MaxSelect: 1, CascadeDelete: true},
		// Lower-case host without port, or "*" for every host no group claims.
		&core.TextField{Name: "host", Required: true, Max: 253, Pattern: `^(\*|[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*)$`},
		// A fixed environment ignores X-Ca-Stage; such a domain is served only by that environment.
		&core.SelectField{Name: "fixedStage", MaxSelect: 1, Values: Stages},
	)
	domains.AddIndex("idx_group_domains_host", true, "host", "")
	withDates(domains)

	operations, err := txApp.FindCollectionByNameOrId(Operations)
	if err != nil {
		return err
	}
	apis := core.NewBaseCollection(APIs)
	apis.Fields.Add(
		&core.RelationField{Name: "group", Required: true, CollectionId: groups.Id, MaxSelect: 1, CascadeDelete: true},
		&core.TextField{Name: "name", Required: true, Max: 100, Pattern: `^[a-z0-9][a-z0-9._-]*$`},
		// Exactly one discovered operation; discovery never creates APIs.
		&core.RelationField{Name: "operation", Required: true, CollectionId: operations.Id, MaxSelect: 1},
		&core.SelectField{Name: "visibility", Required: true, MaxSelect: 1, Values: []string{"public", "private"}},
		// passthrough leaves authentication to the upstream; signature and jwt bring their plugin.
		&core.SelectField{Name: "auth", Required: true, MaxSelect: 1, Values: []string{"passthrough", "none", "signature", "jwt"}},
		&core.RelationField{Name: "policySet", CollectionId: sets.Id, MaxSelect: 1},
		&core.JSONField{Name: "overrides", MaxSize: 1 << 20},
		// Higher priorities match first on a domain; equal priorities must not overlap.
		&core.NumberField{Name: "priority", OnlyInt: true, Min: ptr(-1000.0), Max: ptr(1000.0)},
		&core.NumberField{Name: "headerTimeoutMs", OnlyInt: true, Min: ptr(0.0)},
		&core.NumberField{Name: "timeoutMs", OnlyInt: true, Min: ptr(0.0)},
		&core.NumberField{Name: "idleTimeoutMs", OnlyInt: true, Min: ptr(0.0)},
		&core.TextField{Name: "note", Max: 500},
	)
	apis.AddIndex("idx_apis_group_name", true, "`group`, name", "")
	apis.AddIndex("idx_apis_group_operation", true, "`group`, operation", "")
	withDates(apis)
	if err := saveAll(txApp, domains, apis); err != nil {
		return err
	}

	consumers, err := txApp.FindCollectionByNameOrId(Consumers)
	if err != nil {
		return err
	}
	// Application-specific settings: the fifth policy layer, for that application's requests.
	consumers.Fields.Add(&core.JSONField{Name: "policies", MaxSize: 1 << 20})
	grants := core.NewBaseCollection(Grants)
	grants.Fields.Add(
		&core.RelationField{Name: "consumer", Required: true, CollectionId: consumers.Id, MaxSelect: 1, CascadeDelete: true},
		// Exactly one of group and api.
		&core.RelationField{Name: "group", CollectionId: groups.Id, MaxSelect: 1, CascadeDelete: true},
		&core.RelationField{Name: "api", CollectionId: apis.Id, MaxSelect: 1, CascadeDelete: true},
		// Empty is every environment.
		&core.SelectField{Name: "stages", MaxSelect: len(Stages), Values: Stages},
		&core.TextField{Name: "note", Max: 500},
	)
	withDates(grants)

	releases := core.NewBaseCollection(Releases)
	releases.Fields.Add(
		&core.SelectField{Name: "stage", Required: true, MaxSelect: 1, Values: Stages},
		&core.SelectField{Name: "kind", Required: true, MaxSelect: 1, Values: []string{"api", "group"}},
		// The API or group id; the definition keeps its name.
		&core.TextField{Name: "target", Required: true, Max: 30},
		&core.TextField{Name: "name", Max: 200},
		&core.TextField{Name: "group", Max: 30},
		&core.NumberField{Name: "version", Required: true, OnlyInt: true, Min: ptr(1.0)},
		&core.NumberField{Name: "previousVersion", OnlyInt: true},
		// The resolved definition served from this release; null takes the target offline.
		&core.JSONField{Name: "definition", MaxSize: 4 << 20},
		&core.TextField{Name: "actor", Max: 200},
		&core.TextField{Name: "note", Max: 500},
		&core.TextField{Name: "reason", Max: 500},
		&core.BoolField{Name: "forced"},
		&core.NumberField{Name: "rollbackOf", OnlyInt: true},
	)
	releases.AddIndex("idx_releases_target_version", true, "stage, kind, target, version", "")
	releases.AddIndex("idx_releases_created", false, "created", "")
	withDates(releases)

	// One per release to an environment: the whole compiled input that environment
	// serves, so a restart serves exactly what was released.
	versions := core.NewBaseCollection(StageVersions)
	versions.Fields.Add(
		&core.SelectField{Name: "stage", Required: true, MaxSelect: 1, Values: Stages},
		&core.NumberField{Name: "version", Required: true, OnlyInt: true, Min: ptr(1.0)},
		&core.JSONField{Name: "config", Required: true, MaxSize: 16 << 20},
		&core.TextField{Name: "actor", Max: 200},
		&core.TextField{Name: "action", Max: 30},
		&core.TextField{Name: "note", Max: 500},
	)
	versions.AddIndex("idx_stage_versions_stage_version", true, "stage, version", "")
	withDates(versions)

	audit, err := txApp.FindCollectionByNameOrId(AuditLogs)
	if err != nil {
		return err
	}
	audit.Fields.Add(
		&core.JSONField{Name: "before", MaxSize: 4 << 20},
		&core.JSONField{Name: "after", MaxSize: 4 << 20},
		&core.JSONField{Name: "diff", MaxSize: 4 << 20},
	)
	audit.AddIndex("idx_audit_logs_resource", false, "resource, resourceId", "")
	if err := saveAll(txApp, consumers, grants, releases, versions, audit); err != nil {
		return err
	}
	// Last, once every collection exists: on an existing data dir the control
	// plane's hooks are already bound and read them. There is nothing to validate.
	baseline := core.NewRecord(sets)
	baseline.Load(map[string]any{"name": Baseline, "items": []any{}, "note": "Platform baseline: every API inherits it first."})
	return txApp.SaveNoValidate(baseline)
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
