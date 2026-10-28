// kanyue.pay is the payment gateway as one binary: the gateway API, the worker
// and an embedded PocketBase whose dashboard (/_/) shows the stored rows.
package main

import (
	"log"
	"os"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"

	"kanyue.pay/internal/gatewaylink"
	"kanyue.pay/internal/pay"
)

func main() {
	app := pocketbase.New()
	app.RootCmd.AddCommand(pay.MigrateCommand(app), pay.MaintenanceCommand())

	// Only serving needs a valid configuration; migrate and superuser commands run without it.
	cfg, cfgErr := pay.LoadConfig(pay.Environ())
	registration, registrationErr := gatewaylink.RegistrationFromEnv(os.Getenv, "kanyue.pay")
	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		if cfgErr != nil {
			return cfgErr
		}
		if registrationErr != nil {
			return registrationErr
		}
		return se.Next()
	})
	app.OnServe().BindFunc(pay.RequireApplied)
	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		svc, work, err := pay.Build(se.App, cfg)
		if err != nil {
			return err
		}
		manifest, err := pay.RegisterWithManifest(se, svc, cfg)
		if err != nil {
			return err
		}
		if registration != nil {
			gatewaylink.Start(se.App, *registration, manifest)
		}
		pay.StartWorker(se.App, svc, work, cfg)
		return se.Next()
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
