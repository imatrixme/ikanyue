package control

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"sort"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"kanyue.gateway/internal/policy"
	"kanyue.gateway/internal/schema"
	"kanyue.gateway/internal/snapshot"
)

// An environment serves the latest release of every API and group setting
// released to it. A release resolves drafts into definitions and stores them;
// taking a target offline releases a null definition, and a rollback releases
// a stored one again. Nothing else changes what an environment serves.

// Target is an API or a group setting.
type Target struct {
	Kind string `json:"kind"` // api or group
	ID   string `json:"id"`
}

// Request releases targets to one environment. Force skips the healthy-instance
// check; it and a RELEASE that differs from PRE need a reason, kept with the release.
type Request struct {
	Stage   string   `json:"stage"`
	Targets []Target `json:"targets"`
	Note    string   `json:"note"`
	Reason  string   `json:"reason"`
	Force   bool     `json:"force"`
}

// Released is what happened to one target.
type Released struct {
	Target
	Name     string            `json:"name"`
	Version  int               `json:"version"`
	Previous int               `json:"previous"`
	Offline  bool              `json:"offline,omitempty"`
	Diff     map[string]Change `json:"diff,omitempty"`
}

// Result is a release's outcome; Version is the environment's new version, 0
// when every target was already served as asked.
type Result struct {
	Stage     string     `json:"stage"`
	Version   int        `json:"version"`
	Released  []Released `json:"released"`
	Unchanged []Target   `json:"unchanged,omitempty"`
}

// PromotionError is returned when a release to RELEASE differs from what PRE
// serves and no reason was given; Diffs show the differences.
type PromotionError struct {
	Diffs []Released `json:"diffs"`
}

func (e *PromotionError) Error() string {
	names := make([]string, len(e.Diffs))
	for i, d := range e.Diffs {
		names[i] = d.Name
	}
	return "RELEASE would differ from PRE for " + strings.Join(names, ", ") + "; give a reason to release anyway"
}

// change is one target's next definition; nil takes it offline.
type change struct {
	Target
	name       string
	definition json.RawMessage
	rollbackOf int
}

// Release resolves the targets' drafts and serves them in req.Stage.
func (c *Control) Release(actor string, req Request) (Result, error) {
	if err := checkRequest(req); err != nil {
		return Result{}, err
	}
	d, err := loadDrafts(c.app, nil)
	if err != nil {
		return Result{}, err
	}
	var changes []change
	var errs []error
	for _, target := range req.Targets {
		next, err := d.resolve(target, req.Stage)
		if err != nil {
			errs = append(errs, err)
			continue
		}
		changes = append(changes, next)
	}
	if err := errors.Join(errs...); err != nil {
		return Result{}, err
	}
	return c.apply(actor, "release", req, changes)
}

// Offline stops serving the targets in req.Stage; deleted drafts can be taken offline too.
func (c *Control) Offline(actor string, req Request) (Result, error) {
	if err := checkRequest(req); err != nil {
		return Result{}, err
	}
	changes := make([]change, len(req.Targets))
	for i, target := range req.Targets {
		changes[i] = change{Target: target, definition: json.RawMessage("null")}
	}
	req.Force = true // nothing new is routed, so there is no instance to check
	return c.apply(actor, "offline", req, changes)
}

// Rollback serves a target's earlier version in req.Stage again, as a new release.
func (c *Control) Rollback(actor string, req Request, version int) (Result, error) {
	if err := checkRequest(req); err != nil {
		return Result{}, err
	}
	if len(req.Targets) != 1 {
		return Result{}, errors.New("roll back one target at a time")
	}
	target := req.Targets[0]
	record, err := c.app.FindFirstRecordByFilter(schema.Releases, "stage = {:stage} && kind = {:kind} && target = {:id} && version = {:version}",
		dbx.Params{"stage": req.Stage, "kind": target.Kind, "id": target.ID, "version": version})
	if err != nil {
		return Result{}, fmt.Errorf("%s has no version %d in %s", target.Kind, version, req.Stage)
	}
	return c.apply(actor, "rollback", req, []change{{Target: target, name: record.GetString("name"),
		definition: json.RawMessage(record.GetString("definition")), rollbackOf: version}})
}

func checkRequest(req Request) error {
	switch {
	case !policy.ValidStage(req.Stage):
		return fmt.Errorf("unknown environment %q", req.Stage)
	case len(req.Targets) == 0:
		return errors.New("name the APIs or groups to release")
	case req.Force && strings.TrimSpace(req.Reason) == "":
		return errors.New("a forced release needs a reason")
	}
	seen := map[Target]bool{}
	for _, target := range req.Targets {
		if target.Kind != "api" && target.Kind != "group" {
			return fmt.Errorf("unknown target kind %q", target.Kind)
		}
		if seen[target] {
			return fmt.Errorf("%s %s is named twice", target.Kind, target.ID)
		}
		seen[target] = true
	}
	return nil
}

// resolve turns a target's draft into its next definition in stage.
func (d *drafts) resolve(target Target, stage string) (change, error) {
	next := change{Target: target}
	var def any
	switch target.Kind {
	case "api":
		i := slices.IndexFunc(d.apis, func(r *core.Record) bool { return r.Id == target.ID })
		if i < 0 {
			return next, fmt.Errorf("API %s does not exist; take it offline instead", target.ID)
		}
		api, err := d.api(d.apis[i], stage)
		if err != nil {
			return next, fmt.Errorf("API %q: %w", api.Name, err)
		}
		next.name, def = api.Name, api
	case "group":
		group := d.groups[target.ID]
		if group == nil {
			return next, fmt.Errorf("group %s does not exist; take it offline instead", target.ID)
		}
		resolved, err := d.group(group)
		if err != nil {
			return next, fmt.Errorf("group %q: %w", resolved.Name, err)
		}
		next.name, def = resolved.Name, resolved
	}
	raw, err := canonical(def)
	next.definition = raw
	return next, err
}

// canonical is JSON with sorted keys, so equal definitions are equal bytes.
func canonical(value any) (json.RawMessage, error) {
	raw, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	var generic any
	if err := json.Unmarshal(raw, &generic); err != nil {
		return nil, err
	}
	return json.Marshal(generic)
}

func definitionDiff(before, after json.RawMessage) map[string]Change {
	var b, a map[string]any
	json.Unmarshal(before, &b)
	json.Unmarshal(after, &a)
	return fieldDiff(b, a)
}

// served are the latest releases of an environment, by target.
func served(app core.App, stage string) (map[Target]*core.Record, error) {
	records, err := app.FindRecordsByFilter(schema.Releases, "stage = {:stage}", "version", 0, 0, dbx.Params{"stage": stage})
	if err != nil {
		return nil, err
	}
	out := map[Target]*core.Record{}
	for _, record := range records {
		out[Target{Kind: record.GetString("kind"), ID: record.GetString("target")}] = record
	}
	return out, nil
}

func definitionOf(record *core.Record) json.RawMessage {
	if record == nil {
		return json.RawMessage("null")
	}
	raw := strings.TrimSpace(record.GetString("definition"))
	if raw == "" {
		return json.RawMessage("null")
	}
	normalized, err := canonical(json.RawMessage(raw))
	if err != nil {
		return json.RawMessage(raw)
	}
	return normalized
}

func isNull(raw json.RawMessage) bool { return len(raw) == 0 || string(raw) == "null" }

// apply checks, compiles and serves the changes in one environment, then
// records them; a failure leaves the environment as it was.
func (c *Control) apply(actor, action string, req Request, changes []change) (Result, error) {
	c.publishMu.Lock()
	defer c.publishMu.Unlock()
	result := Result{Stage: req.Stage}
	current, err := served(c.app, req.Stage)
	if err != nil {
		return result, err
	}
	var pre map[Target]*core.Record
	if req.Stage == "RELEASE" && action == "release" {
		if pre, err = served(c.app, "PRE"); err != nil {
			return result, err
		}
	}
	var effective []change
	var promotions []Released
	for _, next := range changes {
		previous := current[next.Target]
		if previous == nil && isNull(next.definition) {
			return result, fmt.Errorf("%s %s is not served in %s", next.Kind, next.ID, req.Stage)
		}
		if bytes.Equal(definitionOf(previous), mustCanonical(next.definition)) {
			result.Unchanged = append(result.Unchanged, next.Target)
			continue
		}
		if next.name == "" && previous != nil {
			next.name = previous.GetString("name")
		}
		effective = append(effective, next)
		if pre != nil && next.Kind == "api" && !bytes.Equal(definitionOf(pre[next.Target]), mustCanonical(next.definition)) {
			promotions = append(promotions, Released{Target: next.Target, Name: next.name,
				Diff: definitionDiff(definitionOf(pre[next.Target]), next.definition)})
		}
	}
	if len(effective) == 0 {
		return result, nil
	}
	if len(promotions) > 0 && strings.TrimSpace(req.Reason) == "" {
		return result, &PromotionError{Diffs: promotions}
	}

	// The environment as it would serve after the release.
	cfg, err := environment(c.app)
	if err != nil {
		return result, err
	}
	cfg.Stage = req.Stage
	defs := map[Target]json.RawMessage{}
	for target, record := range current {
		defs[target] = definitionOf(record)
	}
	for _, next := range effective {
		defs[next.Target] = next.definition
	}
	if err := assemble(&cfg, defs); err != nil {
		return result, err
	}
	if err := c.precheck(cfg, req, effective); err != nil {
		return result, err
	}
	latest, err := latestStageVersion(c.app, req.Stage)
	switch {
	case err == nil:
		cfg.Version = latest.GetInt("version") + 1
	case errors.Is(err, errNoVersion):
		cfg.Version = 1
	default:
		return result, err
	}
	result.Version = cfg.Version
	routes, err := c.compile(cfg)
	if err != nil {
		return result, err
	}
	if _, err := c.handler.Prepare(routes); err != nil {
		return result, err
	}

	err = c.app.RunInTransaction(func(txApp core.App) error {
		result.Released = nil
		releases, err := txApp.FindCollectionByNameOrId(schema.Releases)
		if err != nil {
			return err
		}
		for _, next := range effective {
			previous := 0
			if record := current[next.Target]; record != nil {
				previous = record.GetInt("version")
			}
			var def any
			if !isNull(next.definition) {
				def = next.definition
			}
			group := ""
			if next.Kind == "api" && def != nil {
				var api snapshot.API
				json.Unmarshal(next.definition, &api)
				group = api.Group
			} else if next.Kind == "group" {
				group = next.ID
			} else if record := current[next.Target]; record != nil {
				group = record.GetString("group")
			}
			record := core.NewRecord(releases)
			record.Load(map[string]any{"stage": req.Stage, "kind": next.Kind, "target": next.ID, "name": next.name, "group": group,
				"version": previous + 1, "previousVersion": previous, "definition": def, "actor": actor, "note": req.Note,
				"reason": req.Reason, "forced": req.Force && action != "offline", "rollbackOf": next.rollbackOf})
			if err := txApp.Save(record); err != nil {
				return err
			}
			result.Released = append(result.Released, Released{Target: next.Target, Name: next.name, Version: previous + 1,
				Previous: previous, Offline: def == nil, Diff: definitionDiff(definitionOf(current[next.Target]), next.definition)})
		}
		versions, err := txApp.FindCollectionByNameOrId(schema.StageVersions)
		if err != nil {
			return err
		}
		version := core.NewRecord(versions)
		version.Load(map[string]any{"stage": req.Stage, "version": cfg.Version, "config": cfg, "actor": actor, "action": action, "note": req.Note})
		if err := txApp.Save(version); err != nil {
			return err
		}
		return activate(txApp, cfg)
	})
	if err != nil {
		return result, err
	}
	if err := c.writeLastKnownGood(cfg); err != nil {
		c.app.Logger().Error("Last-known-good snapshot not written", "stage", req.Stage, "error", err.Error())
	}
	if err := c.handler.SetStage(routes); err != nil {
		return result, err
	}
	targets := make([]map[string]any, len(result.Released))
	for i, r := range result.Released {
		targets[i] = map[string]any{"kind": r.Kind, "id": r.ID, "name": r.Name, "version": r.Version, "previous": r.Previous}
	}
	c.audit(actor, action, schema.Releases, req.Stage, map[string]any{"stage": req.Stage, "stageVersion": cfg.Version,
		"targets": targets, "note": req.Note, "reason": req.Reason, "force": req.Force && action != "offline"})
	return result, nil
}

func mustCanonical(raw json.RawMessage) json.RawMessage {
	if isNull(raw) {
		return json.RawMessage("null")
	}
	normalized, err := canonical(raw)
	if err != nil {
		return raw
	}
	return normalized
}

// assemble fills cfg with the served definitions; APIs of groups that are not
// served in the environment are an error.
func assemble(cfg *snapshot.Config, defs map[Target]json.RawMessage) error {
	var errs []error
	targets := make([]Target, 0, len(defs))
	for target := range defs {
		targets = append(targets, target)
	}
	sort.Slice(targets, func(i, j int) bool {
		if targets[i].Kind != targets[j].Kind {
			return targets[i].Kind > targets[j].Kind // groups first
		}
		return targets[i].ID < targets[j].ID
	})
	groups := map[string]bool{}
	for _, target := range targets {
		raw := defs[target]
		if isNull(raw) {
			continue
		}
		switch target.Kind {
		case "group":
			var group snapshot.Group
			if err := json.Unmarshal(raw, &group); err != nil {
				errs = append(errs, fmt.Errorf("group %s: %w", target.ID, err))
				continue
			}
			groups[group.ID] = true
			cfg.Groups = append(cfg.Groups, group)
		case "api":
			var api snapshot.API
			if err := json.Unmarshal(raw, &api); err != nil {
				errs = append(errs, fmt.Errorf("API %s: %w", target.ID, err))
				continue
			}
			if !groups[api.Group] {
				errs = append(errs, fmt.Errorf("API %q: its group is not released in %s; release the group first", api.Name, cfg.Stage))
				continue
			}
			cfg.APIs = append(cfg.APIs, api)
		}
	}
	return errors.Join(errs...)
}

// precheck refuses changed APIs whose operation was removed, and, unless
// forced, APIs whose service has no healthy instance in the environment.
func (c *Control) precheck(cfg snapshot.Config, req Request, changes []change) error {
	names := map[string]string{}
	for _, service := range cfg.Services {
		names[service.ID] = service.Name
	}
	var errs []error
	now := time.Now()
	checked := map[string]bool{}
	for _, next := range changes {
		if next.Kind != "api" || isNull(next.definition) {
			continue
		}
		var api snapshot.API
		if err := json.Unmarshal(next.definition, &api); err != nil {
			errs = append(errs, err)
			continue
		}
		op, err := c.app.FindRecordById(schema.Operations, api.Operation.ID)
		if err != nil || op.GetString("status") == "removed" {
			errs = append(errs, fmt.Errorf("API %q: operation %s was removed from the service manifest", api.Name, api.Operation.Pattern()))
		}
		if req.Force || checked[api.Service] {
			continue
		}
		checked[api.Service] = true
		if healthy, _ := c.handler.Endpoints().Healthy(api.Service, req.Stage, now); healthy == 0 {
			errs = append(errs, fmt.Errorf("service %q has no healthy %s instance; release with force and a reason to proceed",
				cmpOr(names[api.Service], api.Service), req.Stage))
		}
	}
	return errors.Join(errs...)
}

func cmpOr(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}

// activate marks the operations an environment now serves as no longer pending.
func activate(txApp core.App, cfg snapshot.Config) error {
	for _, api := range cfg.APIs {
		record, err := txApp.FindRecordById(schema.Operations, api.Operation.ID)
		if err != nil {
			continue // a rollback may serve operations that were since deleted
		}
		if record.GetString("status") == "pending" {
			record.Set("status", "active")
			if err := txApp.Save(record); err != nil {
				return err
			}
		}
	}
	return nil
}

// State is one target in one environment: what is served and whether the draft differs.
type State struct {
	Version int `json:"version"`
	// Status is unreleased (never served), offline, current or changed; error when the draft cannot be resolved.
	Status string `json:"status"`
	Error  string `json:"error,omitempty"`
}

// States reports every API and group in every environment.
func (c *Control) States() (map[string]map[string]State, error) {
	d, err := loadDrafts(c.app, nil)
	if err != nil {
		return nil, err
	}
	out := map[string]map[string]State{}
	for _, stage := range policy.Stages {
		current, err := served(c.app, stage)
		if err != nil {
			return nil, err
		}
		var targets []Target
		for _, api := range d.apis {
			targets = append(targets, Target{Kind: "api", ID: api.Id})
		}
		for id := range d.groups {
			targets = append(targets, Target{Kind: "group", ID: id})
		}
		for target := range current {
			if !slices.Contains(targets, target) {
				targets = append(targets, target)
			}
		}
		for _, target := range targets {
			state := State{Status: "unreleased"}
			record := current[target]
			if record != nil {
				state.Version = record.GetInt("version")
				state.Status = "current"
				if isNull(definitionOf(record)) {
					state.Status = "offline"
				}
			}
			next, err := d.resolve(target, stage)
			switch {
			case err != nil && strings.Contains(err.Error(), "does not exist"):
				if state.Status == "current" {
					state.Status, state.Error = "changed", "deleted; take it offline"
				}
			case err != nil:
				state.Status, state.Error = "error", err.Error()
			case record != nil && state.Status == "current" && !bytes.Equal(definitionOf(record), next.definition):
				state.Status = "changed"
			}
			key := target.Kind + ":" + target.ID
			if out[key] == nil {
				out[key] = map[string]State{}
			}
			out[key][stage] = state
		}
	}
	return out, nil
}

// Preview resolves the targets in an environment without releasing them.
func (c *Control) Preview(req Request) ([]map[string]any, error) {
	if !policy.ValidStage(req.Stage) {
		return nil, fmt.Errorf("unknown environment %q", req.Stage)
	}
	d, err := loadDrafts(c.app, nil)
	if err != nil {
		return nil, err
	}
	current, err := served(c.app, req.Stage)
	if err != nil {
		return nil, err
	}
	pre := map[Target]*core.Record{}
	if req.Stage == "RELEASE" {
		if pre, err = served(c.app, "PRE"); err != nil {
			return nil, err
		}
	}
	var out []map[string]any
	for _, target := range req.Targets {
		entry := map[string]any{"kind": target.Kind, "id": target.ID}
		served := definitionOf(current[target])
		if record := current[target]; record != nil {
			entry["version"] = record.GetInt("version")
		}
		entry["served"] = served
		next, err := d.resolve(target, req.Stage)
		if err != nil {
			entry["error"] = err.Error()
		} else {
			entry["name"], entry["draft"] = next.name, next.definition
			entry["diff"] = definitionDiff(served, next.definition)
			if req.Stage == "RELEASE" && target.Kind == "api" {
				entry["preDiff"] = definitionDiff(definitionOf(pre[target]), next.definition)
			}
		}
		out = append(out, entry)
	}
	return out, nil
}
