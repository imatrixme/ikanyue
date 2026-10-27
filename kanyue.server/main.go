package main

import (
	"log"
	"os"
	"strings"

	"github.com/pocketbase/pocketbase"

	"kanyue.server/internal/server"
	"kanyue.server/internal/venues"
)

func main() {
	app := pocketbase.New()

	honoModules := []string{}
	if value := os.Getenv("KANYUE_HONO_MODULES"); value != "" {
		honoModules = strings.Split(value, ",")
	}
	err := server.Register(app, server.Config{
		HonoURL:     os.Getenv("HONO_UPSTREAM_URL"),
		HonoModules: honoModules,
		Modules: []server.Module{
			{Name: "venues", Register: venues.Register},
		},
	})
	if err != nil {
		log.Fatal(err)
	}

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
