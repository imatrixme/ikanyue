// Package migrations holds kanyue.server's schema migrations. They live in their own
// list, not core.AppMigrations, because `serve` applies AppMigrations automatically
// and releases must run `migrate up` explicitly. Records share PocketBase's
// _migrations table with the legacy JS migrations; names carry a kanyue_ prefix.
package migrations

import (
	"fmt"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/spf13/cobra"
)

var list core.MigrationsList

func init() {
	list.Register(ensureVenues, nil, "kanyue_0001_venues")
	list.Register(freezeCreatedTimestamps, nil, "kanyue_0002_freeze_created")
	list.Register(ensureBaseline, nil, "kanyue_0003_baseline")
	list.Register(allowAuditActorRoles, nil, "kanyue_0004_audit_actor_roles")
	list.Register(EnsureRenewalReminders, nil, "kanyue_0005_renewal_reminders")
}

// Up applies pending migrations in one transaction and returns their names.
func Up(app core.App) ([]string, error) {
	return core.NewMigrationsRunner(app, list).Up()
}

// Pending lists migrations not yet recorded as applied.
func Pending(app core.App) ([]string, error) {
	pending := []string{}
	for _, migration := range list.Items() {
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
	pending, err := Pending(se.App)
	if err != nil {
		return err
	}
	if len(pending) > 0 {
		return fmt.Errorf("pending migrations: %s; run `kanyue.server migrate up` first", strings.Join(pending, ", "))
	}
	return se.Next()
}

// Command is `migrate up`; other directions are deliberately absent, restore a backup instead.
func Command(app core.App) *cobra.Command {
	return &cobra.Command{
		Use:       "migrate up",
		Short:     "Apply pending kanyue.server migrations",
		ValidArgs: []string{"up"},
		Args:      cobra.MatchAll(cobra.ExactArgs(1), cobra.OnlyValidArgs),
		RunE: func(cmd *cobra.Command, args []string) error {
			applied, err := Up(app)
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
