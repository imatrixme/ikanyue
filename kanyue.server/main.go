package main

import (
	"log"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/catalog"
	"kanyue.server/internal/config"
	"kanyue.server/internal/coursecredit"
	"kanyue.server/internal/identity"
	"kanyue.server/internal/migrations"
	"kanyue.server/internal/server"
	"kanyue.server/internal/students"
	"kanyue.server/internal/venues"
)

func main() {
	app := pocketbase.New()
	cfg := config.FromEnv()

	app.RootCmd.AddCommand(migrations.Command(app))

	// Only serving needs the secret and a valid outbox webhook; migrate and superuser commands run without them.
	signer, signerErr := auth.NewSigner(cfg.JWTSecret)
	dispatcher, dispatcherErr := coursecredit.NewNotificationDispatcher(cfg.OutboxWebhookURL, cfg.OutboxWebhookSecret,
		cfg.OutboxWebhookTimeoutMs, cfg.NodeEnv)
	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		if signerErr != nil {
			return signerErr
		}
		if dispatcherErr != nil {
			return dispatcherErr
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
			{Name: "students", Register: func(se *core.ServeEvent) {
				students.Module{Signer: signer}.Register(se)
				coursecredit.FollowUpsModule{Signer: signer}.Register(se)
			}},
			{Name: "course-catalog", Register: coursecredit.CatalogModule{Signer: signer}.Register},
			{Name: "ledger", Register: coursecredit.LedgerModule{Signer: signer, GrantsEnabled: cfg.CourseCreditGrants,
				Dispatcher: dispatcher}.Register},
			{Name: "booking", Register: coursecredit.BookingModule{Signer: signer, ReservationEnabled: cfg.CourseCreditReservation}.Register},
			{Name: "sessions", Register: coursecredit.SessionsModule{Signer: signer, SettlementEnabled: cfg.CourseCreditSettlement}.Register},
			{Name: "commerce", Register: coursecredit.CommerceModule{Signer: signer, Enabled: cfg.CourseCommerce,
				Config: coursecredit.CommerceConfig{GatewayURL: cfg.PayGatewayURL, ServiceToken: cfg.PayServiceToken,
					MockToken: cfg.PayMockToken, EventToken: cfg.PayEventToken, WechatAppID: cfg.WechatAppID, Mock: cfg.PayMockEnabled},
				RecoveryInterval: 3 * time.Second}.Register},
		},
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
