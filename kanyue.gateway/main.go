// kanyue.gateway is the API gateway as one binary: the data plane on
// GATEWAY_LISTEN, and the control plane (configuration, discovery, publishing)
// on an embedded PocketBase whose --http address must stay private.
package main

import (
	"log"
	"log/slog"
	"os"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"

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
	control.New(app, cfg, handler).Register()

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
