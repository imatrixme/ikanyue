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
	"strings"

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
	app.RootCmd.AddCommand(totpCommand(app, gateway), exposureCommand(app, gateway), rotateKeyCommand(app, gateway))

	if err := app.Start(); err != nil {
		log.Fatal(err)
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
