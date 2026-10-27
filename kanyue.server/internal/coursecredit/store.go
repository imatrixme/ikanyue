package coursecredit

import (
	"errors"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/records"
)

// This file is Hono's PocketBaseBatchRepository over the embedded app: reads
// return records as Hono decoded them from REST JSON (expand included), and a
// plan of creates/updates commits in one transaction like a PocketBase batch.

// maxPlanSteps is Hono's MAX_BATCH_PLAN_REQUESTS.
const maxPlanSteps = 500

func exported(app core.App, items []*core.Record, expand []string) []map[string]any {
	if len(expand) > 0 && len(items) > 0 {
		app.ExpandRecords(items, expand, nil)
	}
	result := make([]map[string]any, len(items))
	for i, record := range items {
		result[i] = records.JSON(record)
	}
	return result
}

// list is getFullList: every matching record in sort order.
func list(app core.App, collection, filter, sort string, expand ...string) ([]map[string]any, error) {
	items, err := app.FindRecordsByFilter(collection, filter, sort, 0, 0)
	if err != nil {
		return nil, err
	}
	return exported(app, items, expand), nil
}

// get is getOne; a missing record is PocketBase's 404.
func get(app core.App, collection, id string, expand ...string) (map[string]any, error) {
	if id == "" {
		// The JS SDK rejects an empty id before sending the request.
		return nil, &storeError{status: 404, message: "Missing required record id."}
	}
	record, err := app.FindRecordById(collection, id)
	if err != nil {
		return nil, err
	}
	return exported(app, []*core.Record{record}, expand)[0], nil
}

// findFirst is getFirstListItem with 404 mapped to nil.
func findFirst(app core.App, collection, filter string, expand ...string) (map[string]any, error) {
	items, err := app.FindRecordsByFilter(collection, filter, "", 1, 0)
	if err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return nil, nil
	}
	return exported(app, items, expand)[0], nil
}

// pageOf is getList.
func pageOf(app core.App, collection, filter, sort string, pageNumber, perPage int, expand ...string) (page, error) {
	result, err := records.Page(app, collection, filter, sort, pageNumber, perPage)
	if err != nil {
		return page{}, err
	}
	return page{Page: result.Page, PerPage: result.PerPage, TotalItems: result.TotalItems, TotalPages: result.TotalPages,
		Items: exported(app, result.Items, expand)}, nil
}

// step is one batch request; an empty id means create.
type step struct {
	collection string
	id         string
	data       map[string]any
}

func create(collection string, data map[string]any) step {
	return step{collection: collection, data: data}
}

func update(collection, id string, data map[string]any) step {
	return step{collection: collection, id: id, data: data}
}

// send commits a plan atomically; any rejected step fails the whole plan the
// way a PocketBase batch did. Version claims' unique index turns concurrent
// writers into a failed plan, which callers retry or replay.
func send(app core.App, plan []step) error {
	if len(plan) == 0 {
		return Fail("EMPTY_BATCH_PLAN", "PocketBase batch plan cannot be empty", nil)
	}
	if len(plan) > maxPlanSteps {
		return Fail("BATCH_PLAN_TOO_LARGE", "单次操作涉及的记录过多，请拆分班级或缩短课堂时长后重试",
			map[string]any{"requests": len(plan)})
	}
	err := app.RunInTransaction(func(tx core.App) error {
		for _, item := range plan {
			var record *core.Record
			if item.id == "" {
				collection, err := tx.FindCachedCollectionByNameOrId(item.collection)
				if err != nil {
					return err
				}
				record = core.NewRecord(collection)
			} else {
				found, err := tx.FindRecordById(item.collection, item.id)
				if err != nil {
					return err
				}
				record = found
			}
			records.SetKnown(record, item.data)
			if err := tx.Save(record); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return batchFailed(err)
	}
	return nil
}

// isVersionConflict is Hono's check for a write that lost a version race.
func isVersionConflict(err error) bool {
	var store *storeError
	if errors.As(err, &store) {
		return store.status == 400 || store.status == 409 || store.code == "VERSION_CONFLICT"
	}
	var business *Error
	return errors.As(err, &business) && business.Code == "VERSION_CONFLICT"
}
