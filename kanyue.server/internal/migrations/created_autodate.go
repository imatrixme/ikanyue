package migrations

import (
	"database/sql"
	"errors"

	"github.com/pocketbase/pocketbase/core"
)

// Hono's local bootstrap created these collections with `created` refreshed on
// every update, so each login overwrote the registration time. Timestamps already
// overwritten cannot be recovered; this only stops further loss.
var createdOnUpdateCollections = []string{"students", "teachers", "activities"}

func freezeCreatedTimestamps(txApp core.App) error {
	for _, name := range createdOnUpdateCollections {
		collection, err := txApp.FindCollectionByNameOrId(name)
		if errors.Is(err, sql.ErrNoRows) {
			continue
		}
		if err != nil {
			return err
		}
		field, ok := collection.Fields.GetByName("created").(*core.AutodateField)
		if !ok || !field.OnUpdate {
			continue
		}
		field.OnUpdate = false
		if err := txApp.Save(collection); err != nil {
			return err
		}
	}
	return nil
}
