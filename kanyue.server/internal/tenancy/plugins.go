package tenancy

import (
	"net/http"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// Plugins are billed by time. An active plugin does everything; once it winds
// down (by hand or past expiresAt) money already in flight is still settled but
// nothing new starts; a disabled plugin does nothing. Orders and credit never
// live in a plugin, so no state takes them away from the tenant.
const (
	Active      = "active"
	WindingDown = "winding_down"
	Disabled    = "disabled"
)

// PluginStatuses are the values tenant_plugins.status may hold.
var PluginStatuses = []string{Active, WindingDown, Disabled}

// Capabilities a route or job needs from a plugin.
const (
	// StartPayment starts collecting money: selling, checkout and the cashier.
	StartPayment = "start_payment"
	// SettleMoney finishes money already in flight: results, callbacks, refunds,
	// recovery and reconciliation.
	SettleMoney = "settle_money"
)

// PluginState is tenant's effective state of plugin; a missing record is disabled.
func PluginState(app core.App, tenant, plugin string) string {
	record, err := app.FindFirstRecordByFilter("tenant_plugins", "tenant={:tenant} && plugin={:plugin}",
		dbx.Params{"tenant": tenant, "plugin": plugin})
	if err != nil {
		return Disabled
	}
	switch status := record.GetString("status"); {
	case status == Disabled || status == "":
		return Disabled
	case status == WindingDown:
		return WindingDown
	}
	if expires := record.GetDateTime("expiresAt"); !expires.IsZero() && !expires.Time().After(time.Now()) {
		return WindingDown
	}
	return Active
}

// Paused reports whether the platform paused starting payments for every
// tenant, for when the payment channel itself is in trouble.
func Paused(app core.App, plugin string) bool {
	record, err := app.FindFirstRecordByFilter("platform_plugins", "plugin={:plugin}", dbx.Params{"plugin": plugin})
	return err == nil && record.GetBool("paused")
}

// Allows reports whether tenant's plugin state grants capability.
func Allows(app core.App, tenant, plugin, capability string) bool {
	switch PluginState(app, tenant, plugin) {
	case Active:
		return capability != StartPayment || !Paused(app, plugin)
	case WindingDown:
		return capability == SettleMoney
	}
	return false
}

// Needs is the route middleware declaring the plugin capability a route needs;
// without it the route answers like a missing one.
func Needs(plugin, capability string) func(e *core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		if !Allows(e.App, ID(e.App), plugin, capability) {
			return e.JSON(http.StatusNotFound, map[string]any{"code": 404, "message": "接口不存在", "data": nil})
		}
		return e.Next()
	}
}

// OnPluginDisabled runs fn in the tenant's scope whenever a tenant's plugin
// record is saved as disabled.
func OnPluginDisabled(app core.App, plugin string, fn func(scoped core.App) error) {
	app.OnRecordAfterUpdateSuccess("tenant_plugins").BindFunc(func(e *core.RecordEvent) error {
		if e.Record.GetString("plugin") == plugin && e.Record.GetString("status") == Disabled {
			if err := fn(Scope(e.App, e.Record.GetString(Field))); err != nil {
				return err
			}
		}
		return e.Next()
	})
}
