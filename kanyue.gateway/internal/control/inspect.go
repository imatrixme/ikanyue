package control

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"slices"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.gateway/internal/plugin"
	"kanyue.gateway/internal/policy"
	"kanyue.gateway/internal/schema"
	"kanyue.gateway/internal/snapshot"
)

// EffectiveView explains an API's policies in one environment: the layers they
// come from, what its draft would serve, and what is served now.
type EffectiveView struct {
	Stage     string                      `json:"stage"`
	Layers    []policy.Layer              `json:"layers"`
	Draft     []policy.Effective          `json:"draft"`
	Consumers map[string][]plugin.Binding `json:"consumers,omitempty"`
	Error     string                      `json:"error,omitempty"`
	Served    *snapshot.API               `json:"served"`
	Version   int                         `json:"version"`
}

// Effective resolves an API's policies in stage, RELEASE by default.
func (c *Control) Effective(id, stage string) (EffectiveView, error) {
	view := EffectiveView{Stage: cmpOr(stage, policy.DefaultStage)}
	if !policy.ValidStage(view.Stage) {
		return view, fmt.Errorf("unknown environment %q", view.Stage)
	}
	d, err := loadDrafts(c.app, nil)
	if err != nil {
		return view, err
	}
	i := slices.IndexFunc(d.apis, func(r *core.Record) bool { return r.Id == id })
	if i < 0 {
		return view, fmt.Errorf("API %s does not exist", id)
	}
	if view.Layers, err = d.layers(d.apis[i]); err == nil {
		view.Draft, view.Consumers, err = d.policies(d.apis[i], view.Stage)
	}
	if err != nil {
		view.Error = err.Error()
	}
	current, err := served(c.app, view.Stage)
	if err != nil {
		return view, err
	}
	if record := current[Target{Kind: "api", ID: id}]; record != nil {
		view.Version = record.GetInt("version")
		if def := definitionOf(record); !isNull(def) {
			view.Served = &snapshot.API{}
			if err := json.Unmarshal(def, view.Served); err != nil {
				return view, err
			}
		}
	}
	return view, nil
}

// Impacted is one API whose policies an edit changes in one environment.
type Impacted struct {
	API   string `json:"api"`
	ID    string `json:"id"`
	Group string `json:"group"`
	Stage string `json:"stage"`
	// Error is set when the edit leaves the API unresolvable: it would be refused.
	Error string `json:"error,omitempty"`
}

// editable are the collections an impact preview accepts.
var editable = []string{schema.PolicySets, schema.APIGroups, schema.APIs, schema.Consumers, schema.Grants}

// Impact previews an unsaved edit: the APIs whose resolved policies it changes,
// per environment, without saving anything. An empty id previews a new record.
func (c *Control) Impact(collection, id string, fields map[string]any) ([]Impacted, error) {
	if !slices.Contains(editable, collection) {
		return nil, fmt.Errorf("no impact preview for %q", collection)
	}
	var record *core.Record
	if id == "" {
		col, err := c.app.FindCollectionByNameOrId(collection)
		if err != nil {
			return nil, err
		}
		record = core.NewRecord(col)
	} else {
		found, err := c.app.FindRecordById(collection, id)
		if err != nil {
			return nil, fmt.Errorf("%s %s does not exist", collection, id)
		}
		record = found.Fresh()
	}
	for key, value := range fields {
		record.Set(key, value)
	}
	before, err := loadDrafts(c.app, nil)
	if err != nil {
		return nil, err
	}
	after, err := loadDrafts(c.app, record)
	if err != nil {
		return nil, err
	}
	// An edit can move an API between groups or sets: check both sides.
	apis := after.affected(record)
	if id != "" {
		for _, api := range before.affected(before.find(record)) {
			if !slices.ContainsFunc(apis, func(r *core.Record) bool { return r.Id == api.Id }) {
				apis = append(apis, api)
			}
		}
	}
	var out []Impacted
	for _, api := range apis {
		for _, stage := range policy.Stages {
			entry := Impacted{API: api.GetString("name"), ID: api.Id, Group: api.GetString("group"), Stage: stage}
			if group := after.groups[entry.Group]; group != nil {
				entry.Group = group.GetString("name")
			}
			next, nextErr := after.fingerprint(api.Id, stage)
			previous, _ := before.fingerprint(api.Id, stage)
			switch {
			case nextErr != nil:
				entry.Error = nextErr.Error()
			case bytes.Equal(next, previous):
				continue
			}
			out = append(out, entry)
		}
	}
	return out, nil
}

// find returns the stored version of record in these drafts, or record itself.
func (d *drafts) find(record *core.Record) *core.Record {
	var list []*core.Record
	switch record.Collection().Name {
	case schema.PolicySets:
		if r := d.sets[record.Id]; r != nil {
			return r
		}
	case schema.APIGroups:
		if r := d.groups[record.Id]; r != nil {
			return r
		}
	case schema.APIs:
		list = d.apis
	case schema.Grants:
		list = d.grants
	}
	if i := slices.IndexFunc(list, func(r *core.Record) bool { return r.Id == record.Id }); i >= 0 {
		return list[i]
	}
	return record
}

// fingerprint is an API's resolved policies in stage, comparable as bytes.
func (d *drafts) fingerprint(id, stage string) ([]byte, error) {
	i := slices.IndexFunc(d.apis, func(r *core.Record) bool { return r.Id == id })
	if i < 0 {
		return nil, errors.New("the API no longer exists")
	}
	api := d.apis[i]
	list, consumers, err := d.policies(api, stage)
	if err != nil {
		return nil, err
	}
	return json.Marshal(map[string]any{"policies": list, "consumers": consumers,
		"visibility": api.GetString("visibility"), "auth": api.GetString("auth")})
}
