package main

import (
	"log"
	"os"
	"time"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/activities"
	"kanyue.server/internal/auth"
	"kanyue.server/internal/catalog"
	"kanyue.server/internal/config"
	"kanyue.server/internal/console"
	"kanyue.server/internal/coursecredit"
	"kanyue.server/internal/devseed"
	"kanyue.server/internal/gatewaylink"
	"kanyue.server/internal/identity"
	"kanyue.server/internal/migrations"
	"kanyue.server/internal/points"
	"kanyue.server/internal/server"
	"kanyue.server/internal/students"
	"kanyue.server/internal/tenancy"
	"kanyue.server/internal/venues"
)

func main() {
	app := pocketbase.New()
	cfg := config.FromEnv()

	app.RootCmd.AddCommand(migrations.Command(app), devseed.Command(app, os.Getenv))

	// Only serving needs the secret and a valid outbox webhook; migrate and superuser commands run without them.
	signer, signerErr := auth.NewSigner(cfg.JWTSecret)
	dispatcher, dispatcherErr := coursecredit.NewNotificationDispatcher(cfg.OutboxWebhookURL, cfg.OutboxWebhookSecret,
		cfg.OutboxWebhookTimeoutMs, cfg.NodeEnv)
	registration, registrationErr := gatewaylink.RegistrationFromEnv(os.Getenv, "kanyue.server")
	renewalWechat, renewalWechatErr := coursecredit.NewRenewalWechat(cfg.WechatAppID, cfg.WechatSecret,
		cfg.WechatRenewalTemplateID, cfg.WechatRenewalTemplateData, cfg.WechatMiniprogramState, cfg.WechatAPIURL)
	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		if signerErr != nil {
			return signerErr
		}
		if dispatcherErr != nil {
			return dispatcherErr
		}
		if renewalWechatErr != nil {
			return renewalWechatErr
		}
		if registrationErr != nil {
			return registrationErr
		}
		if registration != nil {
			registration.Gauges = map[string]func() (float64, error){"outboxDeadLetters": coursecredit.DeadLetters(se.App)}
		}
		if err := gatewaylink.ConfigureBackups(se.App, os.Getenv); err != nil {
			return err
		}
		return se.Next()
	})
	app.OnServe().BindFunc(migrations.RequireApplied)
	server.Register(app, server.Config{
		Console:      console.FS(),
		Modules:      modules(cfg, signer, dispatcher, renewalWechat),
		Registration: registration,
	})

	failed := exitOnFailure(app.RootCmd)
	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
	if failed() {
		os.Exit(1)
	}
}

// modules lists the business areas in registration order.
func modules(cfg config.Config, signer *auth.Signer, dispatcher coursecredit.Dispatcher, renewalWechat *coursecredit.RenewalWechat) []server.Module {
	return []server.Module{
		{Name: "venues", Register: venues.Module{Signer: signer, PublicAssetBaseURL: cfg.PublicAssetBaseURL, PBPublicURL: cfg.PBPublicURL}.Register},
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
		{Name: "migration", Register: coursecredit.MigrationModule{Signer: signer, Enabled: cfg.CourseCreditMigration}.Register},
		{Name: "commerce", Plugin: tenancy.Payment, Register: coursecredit.CommerceModule{Signer: signer, Enabled: cfg.CourseCommerce,
			Config: coursecredit.CommerceConfig{GatewayURL: cfg.PayGatewayURL, ServiceToken: cfg.PayServiceToken,
				MockToken: cfg.PayMockToken, EventToken: cfg.PayEventToken, WechatAppID: cfg.WechatAppID, Mock: cfg.PayMockEnabled},
			RecoveryInterval: 3 * time.Second}.Register},
		{Name: "renewals", Register: coursecredit.RenewalsModule{Signer: signer, Wechat: renewalWechat}.Register},
		{Name: "activities", Register: activities.Module{PublicAssetBaseURL: cfg.PublicAssetBaseURL, PBPublicURL: cfg.PBPublicURL}.Register},
		{Name: "points", Register: points.Module{Signer: signer, PublicAssetBaseURL: cfg.PublicAssetBaseURL, PBPublicURL: cfg.PBPublicURL}.Register},
	}
}
