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
		switch e.Request.Pattern {
		case "POST /api/collections/{collection}/auth-with-otp":
			return c.checkTOTP(e)
		case "POST /api/sql":
			// PocketBase's SQL console would let a superuser rewrite the append-only audit and releases.
			return e.ForbiddenError("The SQL console is disabled on the gateway.", nil)
		}
		return e.Next()
	})
	admin := se.Router.Group("/gateway/v1")
	viewer, releaser, adminRole := c.require("viewer"), c.require("releaser"), c.require("admin")
	// Releasers are further limited to their environments inside the handlers.
	admin.POST("/release", c.releaseRoute).BindFunc(releaser)
	admin.POST("/offline", c.offlineRoute).BindFunc(releaser)
	admin.POST("/rollback", c.rollbackRoute).BindFunc(releaser)
	admin.GET("/approvals", c.approvalsRoute).BindFunc(viewer)
	admin.POST("/approvals/{id}/approve", c.decideRoute(true)).BindFunc(releaser)
	admin.POST("/approvals/{id}/reject", c.decideRoute(false)).BindFunc(releaser)
	admin.POST("/preview", c.previewRoute).BindFunc(viewer)
	admin.GET("/states", c.statesRoute).BindFunc(viewer)
	admin.GET("/compare", c.compareRoute).BindFunc(viewer)
	admin.GET("/apis/{id}/effective", c.effectiveRoute).BindFunc(viewer)
	admin.POST("/impact", c.impactRoute).BindFunc(viewer)
	admin.GET("/status", c.statusRoute).BindFunc(viewer)
	admin.GET("/plugins", c.pluginsRoute).BindFunc(viewer)
	admin.GET("/logs", c.logsRoute).BindFunc(viewer)
	admin.GET("/metrics", c.metricsRoute).BindFunc(viewer)
	// Prometheus scrapes with a viewer token as its bearer token.
	admin.GET("/prometheus", c.prometheusRoute).BindFunc(viewer)
	admin.GET("/graph", c.graphRoute).BindFunc(viewer)
	admin.GET("/events", c.eventsRoute).BindFunc(viewer)
	admin.GET("/reports", c.reportsRoute).BindFunc(viewer)
	admin.GET("/config", c.exportConfigRoute).BindFunc(viewer)
	admin.POST("/config/apply", c.applyConfigRoute).BindFunc(adminRole)
	admin.POST("/exporters/{id}/probe", c.probeRoute).BindFunc(adminRole)
	// Only a signed-in superuser mints tokens, so a leaked token cannot make more.
	admin.POST("/tokens", c.createTokenRoute).Bind(apis.RequireSuperuserAuth())
	admin.POST("/heartbeat", c.heartbeatRoute)
	admin.POST("/deregister", c.deregisterRoute)
	bindConsole(se, console.FS())
}

func (c *Control) releaseRoute(e *core.RequestEvent) error {
	var req Request
	if err := e.BindBody(&req); err != nil {
		return e.BadRequestError("Invalid body.", err)
	}
	if err := c.mayRelease(e, req.Stage); err != nil {
		return err
	}
	actor := principalOf(e).Actor
	if needsApproval(c.cfg.ReleaseApproval, req.Stage) {
		approval, result, err := c.RequestRelease(actor, req)
		if err != nil || approval == nil {
			return releaseResult(e, func() (Result, error) { return result, err })
		}
		return e.JSON(http.StatusAccepted, map[string]any{"approval": approval.PublicExport()})
	}
	return releaseResult(e, func() (Result, error) { return c.Release(actor, req) })
}

func (c *Control) offlineRoute(e *core.RequestEvent) error {
	var req Request
	if err := e.BindBody(&req); err != nil {
		return e.BadRequestError("Invalid body.", err)
	}
	if err := c.mayRelease(e, req.Stage); err != nil {
		return err
	}
	return releaseResult(e, func() (Result, error) { return c.Offline(principalOf(e).Actor, req) })
}

func (c *Control) rollbackRoute(e *core.RequestEvent) error {
	var body struct {
		Request
		Version int `json:"version"`
	}
	if err := e.BindBody(&body); err != nil || body.Version < 1 {
		return e.BadRequestError("A version to roll back to is required.", err)
	}
	if err := c.mayRelease(e, body.Stage); err != nil {
		return err
	}
	return releaseResult(e, func() (Result, error) { return c.Rollback(principalOf(e).Actor, body.Request, body.Version) })
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
