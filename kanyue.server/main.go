package main

import (
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/catalog"
	"kanyue.server/internal/config"
	"kanyue.server/internal/identity"
	"kanyue.server/internal/migrations"
	"kanyue.server/internal/server"
	"kanyue.server/internal/venues"
)

func main() {
	app := pocketbase.New()
	cfg := config.FromEnv()

	app.RootCmd.AddCommand(migrations.Command(app))

	// Only serving needs the secret; migrate and superuser commands run without it.
	signer, signerErr := auth.NewSigner(cfg.JWTSecret)
	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		if signerErr != nil {
			return signerErr
		}
		return se.Next()
	})
	app.OnServe().BindFunc(migrations.RequireApplied)
	server.Register(app, server.Config{
		HonoURL:     cfg.HonoURL,
		HonoModules: cfg.HonoModules,
		Modules: []server.Module{
			{Name: "venues", Register: venues.Module{Signer: signer}.Register},
			{Name: "catalog", Register: catalog.Module{}.Register},
			{Name: "identity", Register: identity.Module{Signer: signer, Config: cfg}.Register},
		},
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
