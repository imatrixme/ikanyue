package control

import (
	"fmt"
	"slices"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"kanyue.gateway/internal/exposure"
	"kanyue.gateway/internal/schema"
)

// Applied is what applying a plan did to its group's drafts.
type Applied struct {
	Group    string   `json:"group"`
	GroupID  string   `json:"groupId"`
	Selected int      `json:"selected"`
	Added    []string `json:"added,omitempty"`
	Updated  []string `json:"updated,omitempty"`
	// Removed are APIs the plan no longer lists; their drafts are deleted, and
	// environments keep serving them until they are taken offline.
	Removed []string `json:"removed,omitempty"`
	// NotServed are listed operations the service does not serve now, such as
	// those of a feature switched off; applying again after it is on adds them.
	NotServed []string `json:"notServed,omitempty"`
}

// ApplyExposure makes the plan's group, domains and APIs match the plan as
// drafts, in one transaction. It never releases.
func (c *Control) ApplyExposure(plan exposure.Plan, actor string) (Applied, error) {
	var applied Applied
	err := c.app.RunInTransaction(func(txApp core.App) error {
		applied = Applied{Group: plan.Group}
		group, err := upsert(txApp, schema.APIGroups, plan.Group)
		if err != nil {
			return err
		}
		if group.IsNew() {
			if err := txApp.Save(group); err != nil {
				return err
			}
		}
		applied.GroupID = group.Id
		if err := applyDomains(txApp, group.Id, plan.Domains); err != nil {
			return err
		}
		listed := map[string]bool{}
		for _, batch := range plan.APIs {
			if err := applyAPIs(txApp, group.Id, batch, listed, &applied); err != nil {
				return fmt.Errorf("APIs of %s: %w", batch.Service, err)
			}
		}
		existing, err := txApp.FindAllRecords(schema.APIs, dbx.HashExp{"group": group.Id})
		if err != nil {
			return err
		}
		for _, api := range existing {
			if listed[api.Id] {
				continue
			}
			applied.Removed = append(applied.Removed, api.GetString("name"))
			if err := txApp.Delete(api); err != nil {
				return err
			}
		}
		slices.Sort(applied.Removed)
		return nil
	})
	if err != nil {
		return Applied{}, err
	}
	c.audit(actor, "apply-exposure", schema.APIGroups, applied.GroupID, map[string]any{"group": plan.Group, "domains": plan.Domains,
		"added": applied.Added, "updated": applied.Updated, "removed": applied.Removed, "notServed": applied.NotServed})
	return applied, nil
}

func applyDomains(txApp core.App, groupID string, hosts []string) error {
	existing, err := txApp.FindAllRecords(schema.GroupDomains, dbx.HashExp{"group": groupID})
	if err != nil {
		return err
	}
	wanted := map[string]bool{}
	for _, host := range hosts {
		wanted[strings.ToLower(strings.TrimSpace(host))] = true
	}
	for _, domain := range existing {
		if wanted[domain.GetString("host")] {
			delete(wanted, domain.GetString("host"))
			continue
		}
		if err := txApp.Delete(domain); err != nil {
			return err
		}
	}
	collection, err := txApp.FindCollectionByNameOrId(schema.GroupDomains)
	if err != nil {
		return err
	}
	for _, host := range slices.Sorted(func(yield func(string) bool) {
		for host := range wanted {
			if !yield(host) {
				return
			}
		}
	}) {
		domain := core.NewRecord(collection)
		domain.Load(map[string]any{"group": groupID, "host": host})
		if err := txApp.Save(domain); err != nil {
			return fmt.Errorf("domain %q (is it bound to another group?): %w", host, err)
		}
	}
	return nil
}

func applyAPIs(txApp core.App, groupID string, batch exposure.APIs, listed map[string]bool, applied *Applied) error {
	service, err := txApp.FindFirstRecordByData(schema.Services, "name", batch.Service)
	if err != nil {
		return fmt.Errorf("service %q has not registered with the gateway yet", batch.Service)
	}
	setID := ""
	if batch.PolicySet != "" {
		set, err := txApp.FindFirstRecordByData(schema.PolicySets, "name", batch.PolicySet)
		if err != nil {
			return fmt.Errorf("no policy set %q", batch.PolicySet)
		}
		setID = set.Id
	}
	records, err := txApp.FindAllRecords(schema.Operations, dbx.HashExp{"service": service.Id}, dbx.Not(dbx.HashExp{"status": "removed"}))
	if err != nil {
		return err
	}
	byPattern := map[string]*core.Record{}
	for _, record := range records {
		byPattern[patternOf(record)] = record
	}
	collection, err := txApp.FindCollectionByNameOrId(schema.APIs)
	if err != nil {
		return err
	}
	settings := map[string]any{"visibility": cmpOr(batch.Visibility, "public"), "auth": cmpOr(batch.Auth, "passthrough"), "policySet": setID}
	for _, pattern := range batch.Operations {
		op, ok := byPattern[pattern]
		if !ok {
			applied.NotServed = append(applied.NotServed, pattern)
			continue
		}
		api, err := txApp.FindFirstRecordByFilter(schema.APIs, "group = {:group} && operation = {:op}", dbx.Params{"group": groupID, "op": op.Id})
		if err != nil {
			api = core.NewRecord(collection)
			name := APIName(op.GetString("method"), op.GetString("path"))
			for i := 2; ; i++ {
				if _, err := txApp.FindFirstRecordByFilter(schema.APIs, "group = {:group} && name = {:name}",
					dbx.Params{"group": groupID, "name": name}); err != nil {
					break // the name is free
				}
				name = fmt.Sprintf("%s-%d", APIName(op.GetString("method"), op.GetString("path")), i)
			}
			api.Load(map[string]any{"group": groupID, "operation": op.Id, "name": name})
			applied.Added = append(applied.Added, pattern)
		} else if api.GetString("visibility") != settings["visibility"] || api.GetString("auth") != settings["auth"] ||
			api.GetString("policySet") != setID {
			applied.Updated = append(applied.Updated, pattern)
		}
		api.Load(settings)
		if err := txApp.Save(api); err != nil {
			return fmt.Errorf("%s: %w", pattern, err)
		}
		listed[api.Id] = true
		applied.Selected++
	}
	return nil
}

// upsert finds a record by its unique name or starts a new one.
func upsert(txApp core.App, collection, name string) (*core.Record, error) {
	if record, err := txApp.FindFirstRecordByData(collection, "name", name); err == nil {
		return record, nil
	}
	c, err := txApp.FindCollectionByNameOrId(collection)
	if err != nil {
		return nil, err
	}
	record := core.NewRecord(c)
	record.Set("name", name)
	return record, nil
}
