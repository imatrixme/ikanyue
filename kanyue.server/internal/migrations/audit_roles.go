package migrations

import (
	"database/sql"
	"errors"
	"slices"

	"github.com/pocketbase/pocketbase/core"
)

// audit.Record writes "anonymous" for requests without a signed-in operator and
// "student" for denied mini-program requests, but the schema only allowed
// teacher/admin, so those entries were silently dropped (failed logins included).
func allowAuditActorRoles(txApp core.App) error {
	collection, err := txApp.FindCollectionByNameOrId("ops_audit_logs")
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	field, ok := collection.Fields.GetByName("actorRole").(*core.SelectField)
	if !ok {
		return nil
	}
	changed := false
	for _, role := range []string{"anonymous", "student"} {
		if !slices.Contains(field.Values, role) {
			field.Values = append(field.Values, role)
			changed = true
		}
	}
	if !changed {
		return nil
	}
	return txApp.Save(collection)
}
