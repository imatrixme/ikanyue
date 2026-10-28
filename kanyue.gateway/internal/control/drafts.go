package control

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"sort"
	"strings"

	validation "github.com/go-ozzo/ozzo-validation/v4"
	"github.com/pocketbase/pocketbase/core"

	"kanyue.gateway/internal/plugin"
	"kanyue.gateway/internal/policy"
	"kanyue.gateway/internal/schema"
	"kanyue.gateway/internal/snapshot"
)

// Drafts are the editable collections: groups, domains, APIs, policy sets,
// applications and grants. Editing them changes no environment; a release
// resolves them into definitions and serves those.

// drafts is one read of the editable collections, optionally with one record
// replaced by its unsaved state, to check an edit before it is saved.
type drafts struct {
	sets      map[string]*core.Record
	setByName map[string]*core.Record
	groups    map[string]*core.Record
	domains   map[string][]*core.Record // group id → domains
	apis      []*core.Record
	ops       map[string]*core.Record
	consumers []*core.Record // enabled only
	grants    []*core.Record
}

func loadDrafts(app core.App, overlay *core.Record) (*drafts, error) {
	d := &drafts{sets: map[string]*core.Record{}, setByName: map[string]*core.Record{}, groups: map[string]*core.Record{},
		domains: map[string][]*core.Record{}, ops: map[string]*core.Record{}}
	read := func(collection string) ([]*core.Record, error) {
		records, err := app.FindAllRecords(collection)
		if err != nil {
			return nil, err
		}
		if overlay != nil && overlay.Collection().Name == collection {
			i := slices.IndexFunc(records, func(r *core.Record) bool { return r.Id == overlay.Id })
			if i >= 0 {
				records[i] = overlay
			} else {
				records = append(records, overlay)
			}
		}
		sort.SliceStable(records, func(i, j int) bool { return records[i].Id < records[j].Id })
		return records, nil
	}
	var errs []error
	load := func(collection string, keep func(*core.Record)) {
		records, err := read(collection)
		if err != nil {
			errs = append(errs, err)
			return
		}
		for _, record := range records {
			keep(record)
		}
	}
	load(schema.PolicySets, func(r *core.Record) { d.sets[r.Id], d.setByName[r.GetString("name")] = r, r })
	load(schema.APIGroups, func(r *core.Record) { d.groups[r.Id] = r })
	load(schema.GroupDomains, func(r *core.Record) { d.domains[r.GetString("group")] = append(d.domains[r.GetString("group")], r) })
	load(schema.APIs, func(r *core.Record) { d.apis = append(d.apis, r) })
	load(schema.Operations, func(r *core.Record) { d.ops[r.Id] = r })
	load(schema.Consumers, func(r *core.Record) {
		if r.GetBool("enabled") {
			d.consumers = append(d.consumers, r)
		}
	})
	load(schema.Grants, func(r *core.Record) { d.grants = append(d.grants, r) })
	sort.SliceStable(d.consumers, func(i, j int) bool { return d.consumers[i].GetString("name") < d.consumers[j].GetString("name") })
	return d, errors.Join(errs...)
}

// items reads a JSON list of policy items strictly.
func items(record *core.Record, field string) ([]policy.Item, error) {
	raw := strings.TrimSpace(record.GetString(field))
	if raw == "" || raw == "null" {
		return nil, nil
	}
	var out []policy.Item
	decoder := json.NewDecoder(bytes.NewReader([]byte(raw)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&out); err != nil {
		return nil, fmt.Errorf("%s must be a list of policy items: %w", field, err)
	}
	return out, nil
}

func (d *drafts) set(id string) (policy.Layer, error) {
	set := d.sets[id]
	if set == nil {
		return policy.Layer{}, nil
	}
	list, err := items(set, "items")
	return policy.Layer{Source: set.GetString("name"), Items: list}, err
}

// layers are an API's first four layers.
func (d *drafts) layers(api *core.Record) ([]policy.Layer, error) {
	var errs []error
	layer := func(kind, id string) policy.Layer {
		l, err := d.set(id)
		errs = append(errs, err)
		l.Kind = kind
		return l
	}
	baseline := policy.Layer{Kind: policy.Baseline, Source: schema.Baseline}
	if record := d.setByName[schema.Baseline]; record != nil {
		baseline = layer(policy.Baseline, record.Id)
	}
	group := d.groups[api.GetString("group")]
	if group == nil {
		return nil, errors.New("its group no longer exists")
	}
	overrides, err := items(api, "overrides")
	return []policy.Layer{
		baseline,
		layer(policy.GroupSet, group.GetString("defaultPolicySet")),
		layer(policy.APISet, api.GetString("policySet")),
		{Kind: policy.Overrides, Source: api.GetString("name"), Items: overrides},
	}, errors.Join(append(errs, err)...)
}

// granted lists the applications granted api, directly or through its group, in stage.
func (d *drafts) granted(api *core.Record, stage string) []string {
	enabled := map[string]string{}
	for _, consumer := range d.consumers {
		enabled[consumer.Id] = consumer.GetString("name")
	}
	var names []string
	for _, grant := range d.grants {
		name, ok := enabled[grant.GetString("consumer")]
		stages := grant.GetStringSlice("stages")
		if !ok || (len(stages) > 0 && !slices.Contains(stages, stage)) {
			continue
		}
		if grant.GetString("api") == api.Id || (grant.GetString("api") == "" && grant.GetString("group") == api.GetString("group")) {
			if !slices.Contains(names, name) {
				names = append(names, name)
			}
		}
	}
	sort.Strings(names)
	return names
}

// policies resolves an API's effective policies in stage and the per-application
// bindings, without looking at its operation.
func (d *drafts) policies(api *core.Record, stage string) ([]policy.Effective, map[string][]plugin.Binding, error) {
	layers, err := d.layers(api)
	if err != nil {
		return nil, nil, err
	}
	resolved, err := policy.Resolve(stage, layers...)
	if err != nil {
		return nil, nil, err
	}
	final, err := policy.Finalize(resolved, api.GetString("auth"), api.GetString("visibility"), d.granted(api, stage))
	if err != nil {
		return nil, nil, err
	}
	var consumers map[string][]plugin.Binding
	var errs []error
	for _, consumer := range d.consumers {
		list, err := items(consumer, "policies")
		if err != nil {
			errs = append(errs, fmt.Errorf("application %q: %w", consumer.GetString("name"), err))
			continue
		}
		if len(list) == 0 {
			continue
		}
		bindings, _, err := policy.ResolveConsumer(stage, final,
			policy.Layer{Kind: policy.Application, Source: consumer.GetString("name"), Items: list})
		if err != nil {
			errs = append(errs, err)
			continue
		}
		if len(bindings) > 0 {
			if consumers == nil {
				consumers = map[string][]plugin.Binding{}
			}
			consumers[consumer.GetString("name")] = bindings
		}
	}
	return final, consumers, errors.Join(errs...)
}

// api resolves an API's definition in stage, as a release would serve it.
func (d *drafts) api(api *core.Record, stage string) (snapshot.API, error) {
	def := snapshot.API{ID: api.Id, Name: api.GetString("name"), Group: api.GetString("group"),
		Visibility: api.GetString("visibility"), Auth: api.GetString("auth"), Priority: api.GetInt("priority"),
		Timeouts: timeoutsOf(api)}
	if set := d.sets[api.GetString("policySet")]; set != nil {
		def.PolicySet = set.GetString("name")
	}
	op := d.ops[api.GetString("operation")]
	switch {
	case op == nil:
		return def, errors.New("its operation no longer exists")
	case op.GetString("status") == "removed":
		return def, fmt.Errorf("operation %s was removed from the service manifest", patternOf(op))
	}
	def.Service = op.GetString("service")
	def.Operation = snapshot.Operation{ID: op.Id, Method: op.GetString("method"), Path: op.GetString("path"),
		Module: op.GetString("module"), Auth: op.GetString("auth"), Idempotent: op.GetBool("idempotent")}
	var err error
	def.Policies, def.Consumers, err = d.policies(api, stage)
	return def, err
}

// group resolves a group's setting: its domains.
func (d *drafts) group(group *core.Record) (snapshot.Group, error) {
	def := snapshot.Group{ID: group.Id, Name: group.GetString("name")}
	if set := d.sets[group.GetString("defaultPolicySet")]; set != nil {
		def.DefaultPolicySet = set.GetString("name")
	}
	for _, domain := range d.domains[group.Id] {
		def.Domains = append(def.Domains, snapshot.Domain{Host: domain.GetString("host"), FixedStage: domain.GetString("fixedStage")})
	}
	sort.Slice(def.Domains, func(i, j int) bool { return def.Domains[i].Host < def.Domains[j].Host })
	if len(def.Domains) == 0 {
		return def, errors.New("the group has no domains")
	}
	return def, nil
}

func patternOf(op *core.Record) string {
	return strings.TrimSpace(op.GetString("method") + " " + op.GetString("path"))
}

// affected lists the APIs whose effective policies depend on record.
func (d *drafts) affected(record *core.Record) []*core.Record {
	var out []*core.Record
	for _, api := range d.apis {
		group := d.groups[api.GetString("group")]
		switch record.Collection().Name {
		case schema.PolicySets:
			if record.GetString("name") == schema.Baseline || api.GetString("policySet") == record.Id ||
				(group != nil && group.GetString("defaultPolicySet") == record.Id) {
				out = append(out, api)
			}
		case schema.APIGroups:
			if api.GetString("group") == record.Id {
				out = append(out, api)
			}
		case schema.APIs:
			if api.Id == record.Id {
				out = append(out, api)
			}
		case schema.Consumers:
			out = append(out, api)
		}
	}
	return out
}

// bindValidation refuses edits that no release could serve: invalid policy
// items, locked policies changed below, authentication without its settings.
// It runs when a record is saved, so mistakes surface while editing.
func (c *Control) bindValidation() {
	c.app.OnRecordValidate(schema.PolicySets, schema.APIGroups, schema.APIs, schema.Consumers, schema.Grants).
		BindFunc(func(e *core.RecordEvent) error {
			if err := checkDraft(e.App, e.Record); err != nil {
				return err
			}
			return e.Next()
		})
	c.app.OnRecordDelete(schema.PolicySets).BindFunc(func(e *core.RecordEvent) error {
		if e.Record.GetString("name") == schema.Baseline {
			return errors.New("the platform baseline cannot be deleted")
		}
		return e.Next()
	})
}

func checkDraft(app core.App, record *core.Record) error {
	field, kind := "", ""
	switch record.Collection().Name {
	case schema.PolicySets:
		field, kind = "items", policy.GroupSet
		original := record.Original().GetString("name")
		if !record.IsNew() && original == schema.Baseline && record.GetString("name") != schema.Baseline {
			return validation.Errors{"name": validation.NewError("validation_baseline", "the platform baseline cannot be renamed")}
		}
		if record.GetString("name") == schema.Baseline {
			kind = policy.Baseline
		}
	case schema.APIs:
		field, kind = "overrides", policy.Overrides
	case schema.Consumers:
		field, kind = "policies", policy.Application
	case schema.APIGroups:
		field = "defaultPolicySet"
	case schema.Grants:
		if (record.GetString("group") == "") == (record.GetString("api") == "") {
			return validation.Errors{"api": validation.NewError("validation_grant", "a grant names either a group or an API")}
		}
		return nil
	}
	if kind != "" {
		list, err := items(record, field)
		if err == nil {
			err = policy.CheckLayer(policy.Layer{Kind: kind, Items: list})
		}
		if err != nil {
			return validation.Errors{field: validation.NewError("validation_policy", err.Error())}
		}
	}
	d, err := loadDrafts(app, record)
	if err != nil {
		return err
	}
	var errs []string
	for _, api := range d.affected(record) {
		for _, stage := range policy.Stages {
			if _, _, err := d.policies(api, stage); err != nil {
				errs = append(errs, fmt.Sprintf("API %q in %s: %v", api.GetString("name"), stage, err))
				break
			}
		}
	}
	if len(errs) > 0 {
		if record.Collection().Name == schema.APIs {
			field = "auth"
			if strings.Contains(errs[0], "locked") || strings.Contains(errs[0], "item") {
				field = "overrides"
			}
		}
		return validation.Errors{field: validation.NewError("validation_policy", strings.Join(errs, "; "))}
	}
	return nil
}
