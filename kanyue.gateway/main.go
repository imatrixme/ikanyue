// kanyue.gateway is the API gateway as one binary: the data plane on
// GATEWAY_LISTEN, and the control plane (configuration, discovery, publishing)
// on an embedded PocketBase whose --http address must stay private.
package main

import (
	"errors"
	"fmt"
	"log"
	"log/slog"
	"os"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/spf13/cobra"

	"kanyue.gateway/internal/config"
	"kanyue.gateway/internal/control"
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
	app.RootCmd.AddCommand(totpCommand(app, gateway))

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
