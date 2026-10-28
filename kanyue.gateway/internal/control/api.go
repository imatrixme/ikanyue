package control

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"kanyue.gateway/internal/console"
	"kanyue.gateway/internal/plugin"
	"kanyue.gateway/internal/schema"
)

// routes is the admin API (superusers) and the registration API (service token).
func (c *Control) routes(se *core.ServeEvent) {
	se.Router.BindFunc(func(e *core.RequestEvent) error {
		if e.Request.Pattern == "POST /api/collections/{collection}/auth-with-otp" {
			return c.checkTOTP(e)
		}
		return e.Next()
	})
	admin := se.Router.Group("/gateway/v1")
	superuser := apis.RequireSuperuserAuth()
	admin.POST("/publish", c.publishRoute).Bind(superuser)
	admin.POST("/rollback", c.rollbackRoute).Bind(superuser)
	admin.GET("/status", c.statusRoute).Bind(superuser)
	admin.GET("/plugins", c.pluginsRoute).Bind(superuser)
	admin.GET("/logs", c.logsRoute).Bind(superuser)
	admin.GET("/metrics", c.metricsRoute).Bind(superuser)
	admin.GET("/graph", c.graphRoute).Bind(superuser)
	admin.GET("/events", c.eventsRoute).Bind(superuser)
	admin.GET("/reports", c.reportsRoute).Bind(superuser)
	admin.POST("/exporters/{id}/probe", c.probeRoute).Bind(superuser)
	admin.POST("/heartbeat", c.heartbeatRoute)
	admin.POST("/deregister", c.deregisterRoute)
	bindConsole(se, console.FS())
}

func (c *Control) publishRoute(e *core.RequestEvent) error {
	var release Release
	if err := e.BindBody(&release); err != nil {
		return e.BadRequestError("Invalid body.", err)
	}
	version, err := c.Publish(actorOf(e.Auth), release)
	if err != nil {
		return e.JSON(http.StatusUnprocessableEntity, map[string]any{"error": err.Error()})
	}
	return e.JSON(http.StatusOK, map[string]any{"version": version})
}

func (c *Control) rollbackRoute(e *core.RequestEvent) error {
	var body struct {
		Release
		Version int `json:"version"`
	}
	if err := e.BindBody(&body); err != nil || body.Version < 1 {
		return e.BadRequestError("A version to roll back to is required.", err)
	}
	version, err := c.Rollback(actorOf(e.Auth), body.Version, body.Release)
	if err != nil {
		return e.JSON(http.StatusUnprocessableEntity, map[string]any{"error": err.Error()})
	}
	return e.JSON(http.StatusOK, map[string]any{"version": version, "rollbackOf": body.Version})
}

func (c *Control) statusRoute(e *core.RequestEvent) error {
	var online int
	err := c.app.DB().Select("count(*)").From(schema.Instances).Where(dbx.HashExp{"status": "online"}).Row(&online)
	if err != nil {
		return err
	}
	return e.JSON(http.StatusOK, map[string]any{
		"version":         c.handler.Version(),
		"onlineInstances": online,
		"endpoints":       c.handler.Endpoints().Status(time.Now()),
		"signals":         c.handler.Signals(),
		"mirrorDropped":   c.handler.MirrorDropped(),
		"telemetry":       c.telemetryStatus(),
	})
}

// pluginsRoute lists the built-in plugins with their schemas, for the console's forms.
func (c *Control) pluginsRoute(e *core.RequestEvent) error {
	type entry struct {
		Name     string          `json:"name"`
		Priority int             `json:"priority"`
		Schema   json.RawMessage `json:"schema"`
	}
	var out []entry
	for _, p := range plugin.All() {
		out = append(out, entry{Name: p.Name(), Priority: p.Priority(), Schema: p.Schema()})
	}
	return e.JSON(http.StatusOK, out)
}

// checkHealth runs due active health checks every second until ctx ends.
func (c *Control) checkHealth(ctx context.Context) {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-ticker.C:
			c.handler.CheckHealth(ctx, now)
		}
	}
}
