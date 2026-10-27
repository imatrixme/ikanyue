package migrations

import (
	"database/sql"
	"errors"

	"github.com/pocketbase/pocketbase/core"
)

// ensureVenues mirrors Hono's ops schema for venues on databases that lack it and
// seeds the studio once, so the mini program never starts with an empty list.
// Existing collections and venues (including inactive ones) are left untouched.
func ensureVenues(txApp core.App) error {
	collection, err := txApp.FindCollectionByNameOrId("venues")
	if errors.Is(err, sql.ErrNoRows) {
		collection = core.NewBaseCollection("venues")
		collection.Fields.Add(
			&core.TextField{Name: "name", Required: true, Max: 40},
			&core.TextField{Name: "intro", Max: 120},
			&core.TextField{Name: "address", Max: 120},
			&core.TextField{Name: "openingHours", Max: 80},
			&core.TextField{Name: "phone", Max: 20},
			&core.BoolField{Name: "bookable"},
			&core.SelectField{Name: "status", Required: true, MaxSelect: 1, Values: []string{"active", "inactive"}},
			&core.NumberField{Name: "sortOrder"},
			&core.AutodateField{Name: "created", OnCreate: true},
			&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
		)
		collection.AddIndex("idx_venues_status_sort", false, "status, sortOrder", "")
		err = txApp.Save(collection)
	}
	if err != nil {
		return err
	}

	total, err := txApp.CountRecords(collection)
	if err != nil || total > 0 {
		return err
	}
	venue := core.NewRecord(collection)
	venue.Load(map[string]any{
		"address":      "",
		"bookable":     true,
		"intro":        "声乐课程与预约",
		"name":         "看乐艺术",
		"openingHours": "",
		"phone":        "18521301857",
		"sortOrder":    0,
		"status":       "active",
	})
	return txApp.Save(venue)
}
