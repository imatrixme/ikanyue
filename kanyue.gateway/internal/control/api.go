package control

import (
	"context"
	"encoding/json"
	"errors"
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
	admin.POST("/release", c.releaseRoute).Bind(superuser)
	admin.POST("/offline", c.offlineRoute).Bind(superuser)
	admin.POST("/rollback", c.rollbackRoute).Bind(superuser)
	admin.POST("/preview", c.previewRoute).Bind(superuser)
	admin.GET("/states", c.statesRoute).Bind(superuser)
	admin.GET("/apis/{id}/effective", c.effectiveRoute).Bind(superuser)
	admin.POST("/impact", c.impactRoute).Bind(superuser)
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

func (c *Control) releaseRoute(e *core.RequestEvent) error {
	var req Request
	if err := e.BindBody(&req); err != nil {
		return e.BadRequestError("Invalid body.", err)
	}
	return releaseResult(e, func() (Result, error) { return c.Release(actorOf(e.Auth), req) })
}

func (c *Control) offlineRoute(e *core.RequestEvent) error {
	var req Request
	if err := e.BindBody(&req); err != nil {
		return e.BadRequestError("Invalid body.", err)
	}
	return releaseResult(e, func() (Result, error) { return c.Offline(actorOf(e.Auth), req) })
}

func (c *Control) rollbackRoute(e *core.RequestEvent) error {
	var body struct {
		Request
		Version int `json:"version"`
	}
	if err := e.BindBody(&body); err != nil || body.Version < 1 {
		return e.BadRequestError("A version to roll back to is required.", err)
	}
	return releaseResult(e, func() (Result, error) { return c.Rollback(actorOf(e.Auth), body.Request, body.Version) })
}

// releaseResult answers a release: 409 with the differences when RELEASE would
// differ from PRE without a reason, 422 for anything else that stopped it.
func releaseResult(e *core.RequestEvent, run func() (Result, error)) error {
	result, err := run()
	var promotion *PromotionError
	switch {
	case errors.As(err, &promotion):
		return e.JSON(http.StatusConflict, map[string]any{"error": err.Error(), "diffs": promotion.Diffs})
	case err != nil:
		return e.JSON(http.StatusUnprocessableEntity, map[string]any{"error": err.Error()})
	}
	return e.JSON(http.StatusOK, result)
}

func (c *Control) previewRoute(e *core.RequestEvent) error {
	var req Request
	if err := e.BindBody(&req); err != nil {
		return e.BadRequestError("Invalid body.", err)
	}
	out, err := c.Preview(req)
	if err != nil {
		return e.JSON(http.StatusUnprocessableEntity, map[string]any{"error": err.Error()})
	}
	return e.JSON(http.StatusOK, out)
}

func (c *Control) statesRoute(e *core.RequestEvent) error {
	out, err := c.States()
	if err != nil {
		return err
	}
	return e.JSON(http.StatusOK, out)
}

func (c *Control) effectiveRoute(e *core.RequestEvent) error {
	out, err := c.Effective(e.Request.PathValue("id"), e.Request.URL.Query().Get("stage"))
	if err != nil {
		return e.JSON(http.StatusUnprocessableEntity, map[string]any{"error": err.Error()})
	}
	return e.JSON(http.StatusOK, out)
}

func (c *Control) impactRoute(e *core.RequestEvent) error {
	var body struct {
		Collection string         `json:"collection"`
		ID         string         `json:"id"`
		Fields     map[string]any `json:"fields"`
	}
	if err := e.BindBody(&body); err != nil {
		return e.BadRequestError("Invalid body.", err)
	}
	out, err := c.Impact(body.Collection, body.ID, body.Fields)
	if err != nil {
		return e.JSON(http.StatusUnprocessableEntity, map[string]any{"error": err.Error()})
	}
	return e.JSON(http.StatusOK, out)
}

func (c *Control) statusRoute(e *core.RequestEvent) error {
	var online int
	err := c.app.DB().Select("count(*)").From(schema.Instances).Where(dbx.HashExp{"status": "online"}).Row(&online)
	if err != nil {
		return err
	}
	return e.JSON(http.StatusOK, map[string]any{
		"versions":        c.handler.Versions(),
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
