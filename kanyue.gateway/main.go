// kanyue.gateway is the API gateway as one binary: the data plane on
// GATEWAY_LISTEN, and the control plane (configuration, discovery, publishing)
// on an embedded PocketBase whose --http address must stay private.
package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"log/slog"
	"os"
	"slices"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/spf13/cobra"

	"kanyue.gateway/internal/config"
	"kanyue.gateway/internal/control"
	"kanyue.gateway/internal/exposure"
	"kanyue.gateway/internal/proxy"
	_ "kanyue.gateway/internal/schema"
)

func main() {
	app := pocketbase.New()

	// Only serving needs a valid configuration; superuser and migrate commands run without it.
	cfg, cfgErr := config.Load(os.Getenv)
	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		if cfgErr != nil {
			return cfgErr
		}
		return se.Next()
	})
	handler := proxy.New(cfg.Trusted, slog.New(slog.NewTextHandler(os.Stderr, nil)))
	gateway := control.New(app, cfg, handler)
	gateway.Register()
	app.RootCmd.AddCommand(totpCommand(app, gateway), exposureCommand(app, gateway), rotateKeyCommand(app, gateway),
		configCommand(app, gateway), backupCommand(gateway))

	failed := exitOnFailure(app.RootCmd)
	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
	if failed() {
		os.Exit(1)
	}
}

// totpCommand enrolls or removes a superuser's authenticator; superusers cannot
// sign in to the admin plane without one.
func totpCommand(app *pocketbase.PocketBase, gateway *control.Control) *cobra.Command {
	command := &cobra.Command{Use: "totp", Short: "Manage superuser authenticators"}
	run := func(action func(email string) error) func(*cobra.Command, []string) error {
		return func(_ *cobra.Command, args []string) error {
			if len(args) != 1 {
				return errors.New("an email is required")
			}
			if err := app.RunAllMigrations(); err != nil {
				return err
			}
			return action(args[0])
		}
	}
	command.AddCommand(&cobra.Command{
		Use:          "enroll <email>",
		Short:        "Give a superuser a new authenticator and print its otpauth:// URI once",
		SilenceUsage: true,
		RunE: run(func(email string) error {
			uri, err := gateway.EnrollTOTP(email)
			if err != nil {
				return err
			}
			fmt.Println(uri)
			return nil
		}),
	}, &cobra.Command{
		Use:          "remove <email>",
		Short:        "Remove a superuser's authenticator",
		SilenceUsage: true,
		RunE:         run(gateway.RemoveTOTP),
	})
	return command
}

// exposureCommand applies a checked-in exposure plan as drafts; operators
// review the APIs and release them per environment in the console.
func exposureCommand(app *pocketbase.PocketBase, gateway *control.Control) *cobra.Command {
	command := &cobra.Command{Use: "exposure", Short: "Apply checked-in API groups"}
	command.AddCommand(&cobra.Command{
		Use:          "apply <plan>",
		Short:        "Make an API group's domains and APIs match an embedded plan, e.g. mapi; releases nothing",
		Args:         cobra.ExactArgs(1),
		SilenceUsage: true,
		RunE: func(_ *cobra.Command, args []string) error {
			plan, err := exposure.Load(args[0])
			if err != nil {
				return err
			}
			if err := app.RunAllMigrations(); err != nil {
				return err
			}
			applied, err := gateway.ApplyExposure(plan, "cli")
			if err != nil {
				return err
			}
			fmt.Printf("group %s on %s: %d APIs (+%d ~%d -%d)\n", applied.Group, strings.Join(plan.Domains, ", "), applied.Selected,
				len(applied.Added), len(applied.Updated), len(applied.Removed))
			for _, name := range applied.Removed {
				fmt.Println("  removed draft, still served until taken offline:", name)
			}
			for _, pattern := range applied.NotServed {
				fmt.Println("  not served by the service now, apply again once it is:", pattern)
			}
			fmt.Println("Nothing is live yet: release the group and its APIs to TEST, PRE and RELEASE in the console.")
			return nil
		},
	})
	return command
}

// rotateKeyCommand re-seals the stored secrets with a new key while no gateway
// serves the data directory; start the gateway with the new key afterwards.
func rotateKeyCommand(app *pocketbase.PocketBase, gateway *control.Control) *cobra.Command {
	var newKeyEnv string
	command := &cobra.Command{
		Use:          "rotate-key --newKeyEnv=<variable>",
		Short:        "Re-seal secrets, released configurations and last-known-good files with a new encryption key",
		Args:         cobra.NoArgs,
		SilenceUsage: true,
		RunE: func(*cobra.Command, []string) error {
			if newKeyEnv == "" {
				return errors.New("--newKeyEnv names the variable holding the new 32 character key")
			}
			if err := app.RunAllMigrations(); err != nil {
				return err
			}
			report, err := gateway.RotateKey(newKeyEnv)
			out, _ := json.MarshalIndent(report, "", "  ")
			fmt.Println(string(out))
			if err != nil {
				return err
			}
			fmt.Println("Rotated. Start the gateway with the new key; keep the old key while backups taken before now are kept.")
			return nil
		},
	}
	command.Flags().StringVar(&newKeyEnv, "newKeyEnv", "", "environment variable holding the new key")
	return command
}

// backupCommand is the restore drill: it restores a backup from the backup
// storage (S3 when configured) into a scratch directory and reports what it
// proved, next to a running gateway; it never serves or touches the live data.
func backupCommand(gateway *control.Control) *cobra.Command {
	command := &cobra.Command{Use: "backup", Short: "Restore drills"}
	var maxAge time.Duration
	verify := &cobra.Command{
		Use:          "verify [name]",
		Short:        "Restore the newest backup, or the named one, into a scratch directory and check that every environment loads",
		Args:         cobra.MaximumNArgs(1),
		SilenceUsage: true,
		RunE: func(_ *cobra.Command, args []string) error {
			name := ""
			if len(args) == 1 {
				name = args[0]
			}
			check, err := gateway.VerifyBackup(name, maxAge)
			out, _ := json.MarshalIndent(check, "", "  ")
			fmt.Println(string(out))
			return err
		},
	}
	verify.Flags().DurationVar(&maxAge, "max-age", 26*time.Hour, "fail when the backup is older; 0 skips the check")
	command.AddCommand(verify)
	return command
}

// configCommand exports the drafts of groups, domains, APIs, policy sets and
// grants to a file, and applies such a file as drafts; nothing is released.
func configCommand(app *pocketbase.PocketBase, gateway *control.Control) *cobra.Command {
	command := &cobra.Command{Use: "config", Short: "Export or apply API drafts as a file"}
	command.AddCommand(&cobra.Command{
		Use:          "export [file]",
		Short:        "Write the drafts to file, or to stdout",
		Args:         cobra.MaximumNArgs(1),
		SilenceUsage: true,
		RunE: func(_ *cobra.Command, args []string) error {
			if err := app.RunAllMigrations(); err != nil {
				return err
			}
			file, err := gateway.ExportConfig()
			if err != nil {
				return err
			}
			out, err := json.MarshalIndent(file, "", "  ")
			if err != nil {
				return err
			}
			if len(args) == 0 {
				fmt.Println(string(out))
				return nil
			}
			return os.WriteFile(args[0], append(out, '\n'), 0o644)
		},
	})
	var dryRun bool
	apply := &cobra.Command{
		Use:          "apply <file>",
		Short:        "Make the drafts match file and list the differences; nothing is released",
		Args:         cobra.ExactArgs(1),
		SilenceUsage: true,
		RunE: func(_ *cobra.Command, args []string) error {
			raw, err := os.ReadFile(args[0])
			if err != nil {
				return err
			}
			var file control.ConfigFile
			if err := json.Unmarshal(raw, &file); err != nil {
				return fmt.Errorf("%s: %w", args[0], err)
			}
			if err := app.RunAllMigrations(); err != nil {
				return err
			}
			changes, err := gateway.ApplyConfig("cli", file, dryRun)
			if err != nil {
				return err
			}
			for _, change := range changes {
				fields := make([]string, 0, len(change.Diff))
				for field := range change.Diff {
					fields = append(fields, field)
				}
				slices.Sort(fields)
				fmt.Printf("%-6s %-9s %s %s\n", change.Action, change.Resource, change.Name, strings.Join(fields, ","))
			}
			switch {
			case len(changes) == 0:
				fmt.Println("The drafts already match the file.")
			case dryRun:
				fmt.Printf("Dry run: %d changes, nothing written.\n", len(changes))
			default:
				fmt.Printf("%d changes written as drafts. Nothing is live until released.\n", len(changes))
			}
			return nil
		},
	}
	apply.Flags().BoolVar(&dryRun, "dry-run", false, "list the differences without writing")
	command.AddCommand(apply)
	return command
}
