package pay

import (
	"fmt"
	"slices"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/spf13/cobra"
)

// Kinds are every pay_entities row type.
var Kinds = []string{"payment", "refund", "event", "provider", "reconciliation", "idempotency", "wechat_mock", "work",
	"audit", "statement", "statement_line", "settlement"}

// Schema changes are explicit (`migrate up`), never applied by serve.
var migrationList core.MigrationsList

func init() {
	migrationList.Register(ensureEntities, nil, "kanyue_pay_0001_entities")
}

// ensureEntities creates pay_entities, or widens the kind list of one created by
// the former TypeScript bootstrap. Rows are superuser-only: no API rules.
func ensureEntities(app core.App) error {
	collection, err := app.FindCollectionByNameOrId(entities)
	if err != nil {
		collection = core.NewBaseCollection(entities)
		collection.Fields.Add(
			&core.SelectField{Name: "kind", Required: true, MaxSelect: 1, Values: Kinds},
			&core.TextField{Name: "owner", Required: true, Max: 64},
			&core.NumberField{Name: "version", Required: true, Min: floatPtr(1), OnlyInt: true},
			&core.JSONField{Name: "data", Required: true, MaxSize: 65536},
			&core.AutodateField{Name: "created", OnCreate: true},
			&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
		)
		collection.AddIndex("idx_pay_entities_owner_kind", false, "owner, kind", "")
		return app.Save(collection)
	}
	kind, ok := collection.Fields.GetByName("kind").(*core.SelectField)
	if !ok {
		return fmt.Errorf("pay_entities.kind is missing")
	}
	for _, value := range Kinds {
		if !slices.Contains(kind.Values, value) {
			kind.Values = append(kind.Values, value)
		}
	}
	return app.Save(collection)
}

func floatPtr(value float64) *float64 { return &value }

func pendingMigrations(app core.App) ([]string, error) {
	pending := []string{}
	for _, migration := range migrationList.Items() {
		var applied int
		err := app.DB().Select("count(*)").From("_migrations").Where(dbx.HashExp{"file": migration.File}).Row(&applied)
		if err != nil {
			return nil, err
		}
		if applied == 0 {
			pending = append(pending, migration.File)
		}
	}
	return pending, nil
}

// RequireApplied refuses to serve against a schema older than the code.
func RequireApplied(se *core.ServeEvent) error {
	pending, err := pendingMigrations(se.App)
	if err != nil {
		return err
	}
	if len(pending) > 0 {
		return fmt.Errorf("pending migrations: %s; run `kanyue-pay migrate up` first", strings.Join(pending, ", "))
	}
	return se.Next()
}

// MigrateCommand is `migrate up`; restore a backup instead of migrating down.
func MigrateCommand(app core.App) *cobra.Command {
	return &cobra.Command{
		Use:       "migrate up",
		Short:     "Apply pending kanyue.pay migrations",
		ValidArgs: []string{"up"},
		Args:      cobra.MatchAll(cobra.ExactArgs(1), cobra.OnlyValidArgs),
		RunE: func(cmd *cobra.Command, args []string) error {
			applied, err := core.NewMigrationsRunner(app, migrationList).Up()
			if err != nil {
				return err
			}
			if len(applied) == 0 {
				cmd.Println("No pending migrations.")
			}
			for _, name := range applied {
				cmd.Println("Applied", name)
			}
			return nil
		},
	}
}
