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

// Applied is what applying a plan did to one route.
type Applied struct {
	Route    string
	RouteID  string
	Selected int
	Added    []string
	Removed  []string
	// NotServed are listed operations the service does not serve now, such as
	// those of a feature switched off; applying again after it is on selects them.
	NotServed []string
}

// ApplyExposure makes the plan's site and routes select exactly the listed
// operations the services serve, in one transaction. It never publishes.
func (c *Control) ApplyExposure(plan exposure.Plan, actor string) ([]Applied, error) {
	var out []Applied
	err := c.app.RunInTransaction(func(txApp core.App) error {
		out = nil
		site, err := upsert(txApp, schema.Sites, plan.Site)
		if err != nil {
			return err
		}
		site.Set("hosts", plan.Hosts)
		if err := txApp.Save(site); err != nil {
			return err
		}
		for _, planned := range plan.Routes {
			applied, err := applyRoute(txApp, site.Id, planned)
			if err != nil {
				return fmt.Errorf("route %q: %w", planned.Name, err)
			}
			out = append(out, applied)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	for _, applied := range out {
		c.audit(actor, "apply-exposure", schema.Routes, applied.RouteID, map[string]any{"site": plan.Site, "route": applied.Route,
			"added": applied.Added, "removed": applied.Removed, "notServed": applied.NotServed})
	}
	return out, nil
}

func applyRoute(txApp core.App, siteID string, planned exposure.Route) (Applied, error) {
	applied := Applied{Route: planned.Name}
	service, err := txApp.FindFirstRecordByData(schema.Services, "name", planned.Service)
	if err != nil {
		return applied, fmt.Errorf("service %q has not registered with the gateway yet", planned.Service)
	}
	records, err := txApp.FindAllRecords(schema.Operations, dbx.HashExp{"service": service.Id}, dbx.Not(dbx.HashExp{"status": "removed"}))
	if err != nil {
		return applied, err
	}
	byPattern := map[string]*core.Record{}
	for _, record := range records {
		byPattern[strings.TrimSpace(record.GetString("method")+" "+record.GetString("path"))] = record
	}
	route, err := upsert(txApp, schema.Routes, planned.Name)
	if err != nil {
		return applied, err
	}
	previous := map[string]bool{}
	for _, id := range route.GetStringSlice("operations") {
		previous[id] = true
	}
	var ids []string
	for _, pattern := range planned.Operations {
		record, ok := byPattern[pattern]
		if !ok {
			applied.NotServed = append(applied.NotServed, pattern)
			continue
		}
		ids = append(ids, record.Id)
		if !previous[record.Id] {
			applied.Added = append(applied.Added, pattern)
		}
		delete(previous, record.Id)
	}
	for id := range previous {
		if record, err := txApp.FindRecordById(schema.Operations, id); err == nil {
			applied.Removed = append(applied.Removed, strings.TrimSpace(record.GetString("method")+" "+record.GetString("path")))
		} else {
			applied.Removed = append(applied.Removed, id)
		}
	}
	slices.Sort(applied.Removed)
	route.Set("site", siteID)
	route.Set("service", service.Id)
	route.Set("operations", ids)
	route.Set("enabled", true)
	applied.Selected = len(ids)
	err = txApp.Save(route)
	applied.RouteID = route.Id
	return applied, err
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
