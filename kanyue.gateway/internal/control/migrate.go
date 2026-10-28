package control

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"slices"
	"sort"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"kanyue.gateway/internal/plugin"
	"kanyue.gateway/internal/policy"
	"kanyue.gateway/internal/schema"
	"kanyue.gateway/internal/snapshot"
)

// legacyConfig is a published version of the site and route model.
type legacyConfig struct {
	Version   int                 `json:"version"`
	Sites     []legacySite        `json:"sites"`
	Services  []snapshot.Service  `json:"services"`
	Routes    []legacyRoute       `json:"routes"`
	Bindings  []legacyBinding     `json:"bindings,omitempty"`
	Consumers []snapshot.Consumer `json:"consumers,omitempty"`
	Secrets   map[string]string   `json:"secrets,omitempty"`
}

type legacySite struct {
	ID    string   `json:"id"`
	Name  string   `json:"name"`
	Hosts []string `json:"hosts"`
}

type legacyRoute struct {
	ID         string               `json:"id"`
	Name       string               `json:"name"`
	Site       string               `json:"site"`
	Service    string               `json:"service"`
	Operations []snapshot.Operation `json:"operations"`
	snapshot.Timeouts
}

type legacyBinding struct {
	plugin.Binding
	Scope  string `json:"scope"`
	Target string `json:"target,omitempty"`
}

func (cfg legacyConfig) bindings(scope, target string) []plugin.Binding {
	var out []plugin.Binding
	for _, b := range cfg.Bindings {
		if b.Scope == scope && b.Target == target {
			out = append(out, b.Binding)
		}
	}
	return out
}

// migrateLegacy turns the site and route model into API groups once, after a
// backup: sites become groups with their hosts as domains, every selected
// operation an API, global bindings the baseline, site bindings a default policy
// set per group, route bindings API overrides, consumer bindings application
// settings, and the published version the first release of every environment,
// so each environment serves what was published. The old collections stay
// readable.
func (c *Control) migrateLegacy() error {
	count := func(collection string) int {
		var n int
		c.app.DB().Select("count(*)").From(collection).Row(&n)
		return n
	}
	if count(schema.StageVersions) > 0 || count(schema.APIGroups) > 0 || (count(schema.Sites) == 0 && count(schema.ConfigVersions) == 0) {
		return nil
	}
	backup := fmt.Sprintf("pre-api-groups-%s.zip", time.Now().UTC().Format("20060102-150405"))
	if err := c.app.CreateBackup(context.Background(), backup); err != nil {
		return fmt.Errorf("backup before migrating: %w", err)
	}
	report, err := c.MigrateLegacy("migration")
	if err != nil {
		return err
	}
	report["backup"] = backup
	c.app.Logger().Info("Migrated sites and routes to API groups", "groups", report["groups"], "apis", report["apis"], "backup", backup)
	return nil
}

// MigrateLegacy runs the migration in one transaction and audits it.
func (c *Control) MigrateLegacy(actor string) (map[string]any, error) {
	var published *legacyConfig
	if latest, err := c.app.FindRecordsByFilter(schema.ConfigVersions, "", "-version", 1, 0); err == nil && len(latest) > 0 {
		published = &legacyConfig{}
		if err := latest[0].UnmarshalJSONField("config", published); err != nil {
			return nil, fmt.Errorf("published version: %w", err)
		}
	}
	drafted, draftErr := collectLegacy(c.app)
	source := drafted
	if published != nil {
		source = *published
	} else if draftErr != nil {
		return nil, draftErr
	}
	report := map[string]any{"published": published != nil}
	if published != nil {
		a, _ := canonical(withoutVersion(*published))
		b, _ := canonical(withoutVersion(drafted))
		if draftErr != nil || !bytes.Equal(a, b) {
			// Unpublished edits of the old model are not carried over; the backup keeps them.
			report["unpublishedEditsDropped"] = true
			c.app.Logger().Warn("Unpublished edits of sites and routes were not migrated; the backup keeps them")
		}
	}
	err := c.app.RunInTransaction(func(txApp core.App) error {
		ids, err := migrateDrafts(txApp, source)
		if err != nil {
			return err
		}
		report["groups"], report["apis"] = len(ids.groups), len(ids.apis)
		if published == nil {
			return nil
		}
		return c.releaseMigrated(txApp, source, ids, actor)
	})
	if err != nil {
		return nil, err
	}
	if published != nil {
		// Last-known-good files follow the committed versions only.
		for _, stage := range policy.Stages {
			var cfg snapshot.Config
			record, err := latestStageVersion(c.app, stage)
			if err == nil {
				err = record.UnmarshalJSONField("config", &cfg)
			}
			if err == nil {
				err = c.writeLastKnownGood(cfg)
			}
			if err != nil {
				c.app.Logger().Error("Last-known-good snapshot not written", "stage", stage, "error", err.Error())
			}
		}
		c.loadRoutes()
	}
	c.audit(actor, "migrate", schema.APIGroups, "", report)
	return report, nil
}

func withoutVersion(cfg legacyConfig) legacyConfig {
	cfg.Version = 0
	return cfg
}

// collectLegacy reads the old editable collections as a configuration.
func collectLegacy(app core.App) (legacyConfig, error) {
	var cfg legacyConfig
	env, err := environment(app)
	if err != nil {
		return cfg, err
	}
	cfg.Services, cfg.Consumers, cfg.Secrets = env.Services, env.Consumers, env.Secrets
	sites, err := app.FindAllRecords(schema.Sites)
	if err != nil {
		return cfg, err
	}
	for _, site := range sites {
		var hosts []string
		site.UnmarshalJSONField("hosts", &hosts)
		cfg.Sites = append(cfg.Sites, legacySite{ID: site.Id, Name: site.GetString("name"), Hosts: hosts})
	}
	routes, err := app.FindAllRecords(schema.Routes, dbx.HashExp{"enabled": true})
	if err != nil {
		return cfg, err
	}
	var errs []error
	for _, route := range routes {
		records, err := app.FindRecordsByIds(schema.Operations, route.GetStringSlice("operations"))
		if err != nil {
			errs = append(errs, err)
			continue
		}
		var ops []snapshot.Operation
		for _, op := range records {
			ops = append(ops, snapshot.Operation{ID: op.Id, Method: op.GetString("method"), Path: op.GetString("path"),
				Module: op.GetString("module"), Auth: op.GetString("auth"), Idempotent: op.GetBool("idempotent")})
		}
		cfg.Routes = append(cfg.Routes, legacyRoute{ID: route.Id, Name: route.GetString("name"), Site: route.GetString("site"),
			Service: route.GetString("service"), Operations: ops, Timeouts: timeoutsOf(route)})
	}
	bindings, err := app.FindRecordsByFilter(schema.PluginBindings, "", "created", 0, 0)
	if err != nil {
		return cfg, err
	}
	for _, record := range bindings {
		b := legacyBinding{Scope: record.GetString("scope")}
		b.Plugin, b.Priority, b.Disabled = record.GetString("plugin"), record.GetInt("priority"), !record.GetBool("enabled")
		if raw := record.GetString("config"); raw != "" && raw != "null" {
			b.Config = json.RawMessage(raw)
		}
		if b.Scope != "global" {
			b.Target = record.GetString(b.Scope)
		}
		cfg.Bindings = append(cfg.Bindings, b)
	}
	return cfg, errors.Join(errs...)
}

type migratedIDs struct {
	groups map[string]string // site id → group id
	apis   map[[2]string]string
}

// itemsOf turns bindings of one level into policy items. A rate limit replaced
// the inherited one in the old model; here limits stack, so the replacement
// first switches the inherited ones off.
func itemsOf(bindings []plugin.Binding, canSwitchOff bool) []policy.Item {
	var out []policy.Item
	for _, b := range bindings {
		if b.Disabled && !canSwitchOff {
			continue
		}
		if policy.Stacks(b.Plugin) && !b.Disabled && canSwitchOff {
			out = append(out, policy.Item{Plugin: b.Plugin, Disabled: true})
		}
		out = append(out, policy.Item{Plugin: b.Plugin, Config: b.Config, Priority: b.Priority, Disabled: b.Disabled})
	}
	return out
}

var nameUnsafe = regexp.MustCompile(`[^a-z0-9._-]+`)

// slug makes a record name from free text.
func slug(text, fallback string) string {
	name := strings.Trim(nameUnsafe.ReplaceAllString(strings.ToLower(text), "-"), "-._")
	if len(name) > 100 {
		name = strings.TrimRight(name[:100], "-._")
	}
	if name == "" {
		return fallback
	}
	return name
}

// APIName names an API after its operation, e.g. get-v1-student-appointments-appointmentid.
func APIName(method, path string) string {
	if method == "" {
		method = "any"
	}
	return slug(method+" "+strings.NewReplacer("{", "", "}", "", "...", "").Replace(path), "api")
}

func migrateDrafts(txApp core.App, cfg legacyConfig) (migratedIDs, error) {
	ids := migratedIDs{groups: map[string]string{}, apis: map[[2]string]string{}}
	collection := func(name string) *core.Collection {
		c, _ := txApp.FindCollectionByNameOrId(name)
		return c
	}
	baseline, err := txApp.FindFirstRecordByData(schema.PolicySets, "name", schema.Baseline)
	if err != nil {
		return ids, err
	}
	baseline.Set("items", itemsOf(cfg.bindings("global", ""), false))
	if err := txApp.Save(baseline); err != nil {
		return ids, fmt.Errorf("baseline: %w", err)
	}
	consumers := map[string]string{}
	for _, consumer := range cfg.Consumers {
		consumers[consumer.ID] = consumer.Name
		record, err := txApp.FindRecordById(schema.Consumers, consumer.ID)
		if err != nil {
			continue
		}
		var list []policy.Item
		for _, b := range cfg.bindings("consumer", consumer.ID) {
			if !b.Disabled {
				list = append(list, policy.Item{Plugin: b.Plugin, Config: b.Config, Priority: b.Priority})
			}
		}
		record.Set("policies", list)
		if err := txApp.Save(record); err != nil {
			return ids, fmt.Errorf("application %q: %w", consumer.Name, err)
		}
	}
	used := map[string]bool{}
	hosts := map[string]bool{}
	for _, site := range cfg.Sites {
		name := slug(site.Name, "site")
		for i := 2; used[name]; i++ {
			name = fmt.Sprintf("%s-%d", slug(site.Name, "site"), i)
		}
		used[name] = true
		group := core.NewRecord(collection(schema.APIGroups))
		group.Load(map[string]any{"name": name, "note": "Migrated from site " + site.Name})
		if list := itemsOf(cfg.bindings("site", site.ID), true); len(list) > 0 {
			set := core.NewRecord(collection(schema.PolicySets))
			set.Load(map[string]any{"name": name + "-default", "items": list, "note": "Migrated from the bindings of site " + site.Name})
			if err := txApp.Save(set); err != nil {
				return ids, fmt.Errorf("policy set of site %q: %w", site.Name, err)
			}
			group.Set("defaultPolicySet", set.Id)
		}
		if err := txApp.Save(group); err != nil {
			return ids, fmt.Errorf("site %q: %w", site.Name, err)
		}
		ids.groups[site.ID] = group.Id
		for _, host := range site.Hosts {
			host = strings.ToLower(strings.TrimSuffix(strings.TrimSpace(host), "."))
			if hosts[host] {
				continue
			}
			hosts[host] = true
			domain := core.NewRecord(collection(schema.GroupDomains))
			domain.Load(map[string]any{"group": group.Id, "host": host})
			if err := txApp.Save(domain); err != nil {
				return ids, fmt.Errorf("site %q host %q: %w", site.Name, host, err)
			}
		}
	}
	names := map[string]bool{}
	for _, route := range cfg.Routes {
		group := ids.groups[route.Site]
		if group == "" {
			continue
		}
		merged := plugin.Merge(cfg.bindings("global", ""), cfg.bindings("site", route.Site), cfg.bindings("route", route.ID))
		auth := "passthrough"
		for _, b := range merged {
			switch {
			case b.Plugin == "aliyun-signature" && auth == "jwt", b.Plugin == "jwt-auth" && auth == "signature":
				return ids, fmt.Errorf("route %q uses both aliyun-signature and jwt-auth; an API has one authentication", route.Name)
			case b.Plugin == "aliyun-signature":
				auth = "signature"
			case b.Plugin == "jwt-auth":
				auth = "jwt"
			}
		}
		overrides := itemsOf(cfg.bindings("route", route.ID), true)
		for _, op := range route.Operations {
			key := [2]string{route.Site, op.ID}
			if ids.apis[key] != "" {
				continue
			}
			if _, err := txApp.FindRecordById(schema.Operations, op.ID); err != nil {
				return ids, fmt.Errorf("route %q serves operation %s, which no longer exists", route.Name, op.Pattern())
			}
			name := APIName(op.Method, op.Path)
			for i := 2; names[group+name]; i++ {
				name = fmt.Sprintf("%s-%d", APIName(op.Method, op.Path), i)
			}
			names[group+name] = true
			api := core.NewRecord(collection(schema.APIs))
			api.Load(map[string]any{"group": group, "name": name, "operation": op.ID, "visibility": "public", "auth": auth,
				"overrides": overrides, "headerTimeoutMs": route.HeaderTimeoutMs, "timeoutMs": route.TimeoutMs,
				"idleTimeoutMs": route.IdleTimeoutMs, "note": "Migrated from route " + route.Name})
			if err := txApp.Save(api); err != nil {
				return ids, fmt.Errorf("route %q operation %s: %w", route.Name, op.Pattern(), err)
			}
			ids.apis[key] = api.Id
		}
	}
	return ids, nil
}

// releaseMigrated releases every migrated group and API as version 1 in every
// environment, with the published version's services, applications and
// secrets, and checks that each serves the published policies.
func (c *Control) releaseMigrated(txApp core.App, legacy legacyConfig, ids migratedIDs, actor string) error {
	d, err := loadDrafts(txApp, nil)
	if err != nil {
		return err
	}
	releases, err := txApp.FindCollectionByNameOrId(schema.Releases)
	if err != nil {
		return err
	}
	versions, err := txApp.FindCollectionByNameOrId(schema.StageVersions)
	if err != nil {
		return err
	}
	var targets []Target
	for _, site := range legacy.Sites {
		targets = append(targets, Target{Kind: "group", ID: ids.groups[site.ID]})
	}
	apiIDs := slices.Sorted(func(yield func(string) bool) {
		for _, id := range ids.apis {
			if !yield(id) {
				return
			}
		}
	})
	for _, id := range apiIDs {
		targets = append(targets, Target{Kind: "api", ID: id})
	}
	for _, stage := range policy.Stages {
		cfg := snapshot.Config{Stage: stage, Version: 1, Services: legacy.Services, Consumers: legacy.Consumers, Secrets: legacy.Secrets}
		defs := map[Target]json.RawMessage{}
		for _, target := range targets {
			next, err := d.resolve(target, stage)
			if err != nil {
				return err
			}
			defs[target] = next.definition
			var group string
			if target.Kind == "group" {
				group = target.ID
			} else {
				var api snapshot.API
				json.Unmarshal(next.definition, &api)
				group = api.Group
			}
			record := core.NewRecord(releases)
			record.Load(map[string]any{"stage": stage, "kind": target.Kind, "target": target.ID, "name": next.name, "group": group,
				"version": 1, "definition": next.definition, "actor": actor, "note": fmt.Sprintf("Migrated from published version %d", legacy.Version)})
			if err := txApp.Save(record); err != nil {
				return err
			}
		}
		if err := assemble(&cfg, defs); err != nil {
			return err
		}
		if _, err := c.compile(cfg); err != nil {
			return fmt.Errorf("%s does not compile after migrating: %w", stage, err)
		}
		if err := parity(legacy, cfg, ids); err != nil {
			return fmt.Errorf("%s would not serve what was published: %w", stage, err)
		}
		version := core.NewRecord(versions)
		version.Load(map[string]any{"stage": stage, "version": 1, "config": cfg, "actor": actor, "action": "migrate",
			"note": fmt.Sprintf("Migrated from published version %d", legacy.Version)})
		if err := txApp.Save(version); err != nil {
			return err
		}
	}
	return nil
}

// parity checks that every published route operation is an API of its site's
// group with the same service, timeouts and policies, for everyone and for
// each application.
func parity(legacy legacyConfig, cfg snapshot.Config, ids migratedIDs) error {
	apis := map[string]snapshot.API{}
	for _, api := range cfg.APIs {
		apis[api.ID] = api
	}
	consumerNames := map[string]string{}
	for _, consumer := range legacy.Consumers {
		consumerNames[consumer.ID] = consumer.Name
	}
	var errs []error
	for _, route := range legacy.Routes {
		merged := plugin.Merge(legacy.bindings("global", ""), legacy.bindings("site", route.Site), legacy.bindings("route", route.ID))
		for _, op := range route.Operations {
			api, ok := apis[ids.apis[[2]string{route.Site, op.ID}]]
			if !ok {
				errs = append(errs, fmt.Errorf("route %q operation %s is not served", route.Name, op.Pattern()))
				continue
			}
			if api.Service != route.Service || api.Operation.Pattern() != op.Pattern() || api.Timeouts != route.Timeouts {
				errs = append(errs, fmt.Errorf("API %q differs from route %q in service, path or timeouts", api.Name, route.Name))
			}
			got := policy.Bindings(api.Policies)
			if view(got) != view(merged) {
				errs = append(errs, fmt.Errorf("API %q policies %s, published %s", api.Name, view(got), view(merged)))
			}
			for id, name := range consumerNames {
				var old []plugin.Binding
				for _, b := range legacy.bindings("consumer", id) {
					if !b.Disabled {
						old = append(old, b)
					}
				}
				before := view(plugin.Merge(merged, old))
				after := view(applyConsumer(got, api.Consumers[name]))
				if before != after {
					errs = append(errs, fmt.Errorf("API %q for application %q: policies %s, published %s", api.Name, name, after, before))
				}
			}
		}
	}
	return errors.Join(errs...)
}

// applyConsumer is what an application's requests run: its bindings replace,
// add or switch off slots.
func applyConsumer(base, consumer []plugin.Binding) []plugin.Binding {
	out := slices.Clone(base)
	for _, b := range consumer {
		i := slices.IndexFunc(out, func(e plugin.Binding) bool { return e.Slot() == b.Slot() })
		switch {
		case b.Disabled && i >= 0:
			out = slices.Delete(out, i, i+1)
		case b.Disabled:
		case i >= 0:
			out[i] = b
		default:
			out = append(out, b)
		}
	}
	return out
}

// view is a binding list as a sorted multiset of plugin and configuration.
func view(bindings []plugin.Binding) string {
	var parts []string
	for _, b := range bindings {
		if b.Disabled {
			continue
		}
		config := "{}"
		if !isNull(b.Config) && strings.TrimSpace(string(b.Config)) != "{}" {
			if normalized, err := canonical(b.Config); err == nil {
				config = string(normalized)
			}
		}
		parts = append(parts, fmt.Sprintf("%s%s@%d", b.Plugin, config, b.Priority))
	}
	sort.Strings(parts)
	return "[" + strings.Join(parts, " ") + "]"
}
