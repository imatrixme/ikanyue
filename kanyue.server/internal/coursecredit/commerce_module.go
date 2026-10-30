package coursecredit

import (
	"crypto/subtle"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/jsx"
	"kanyue.server/internal/tenancy"
)

// CommerceModule serves online course purchase: the student catalog, orders,
// payment and refunds, the finance workspace, the gateway's payment-event
// callback and the recovery job that replaces Hono's commerce-worker.
type CommerceModule struct {
	Signer *auth.Signer
	// Enabled is COURSE_COMMERCE_ENABLED=true; otherwise no route is registered.
	Enabled bool
	Config  CommerceConfig
	// RecoveryInterval is the recovery job's period; zero disables the job.
	RecoveryInterval time.Duration
}

// encodeURIComponent escapes a path segment the way the JavaScript global does.
func encodeURIComponent(value string) string {
	var builder strings.Builder
	for _, b := range []byte(value) {
		if b >= 'a' && b <= 'z' || b >= 'A' && b <= 'Z' || b >= '0' && b <= '9' || strings.IndexByte("-_.!~*'()", b) >= 0 {
			builder.WriteByte(b)
			continue
		}
		builder.WriteString("%" + strings.ToUpper(string("0123456789abcdef"[b>>4])+string("0123456789abcdef"[b&15])))
	}
	return builder.String()
}

func (m CommerceModule) Register(se *core.ServeEvent) {
	if !m.Enabled {
		return
	}
	router := se.Router
	// base holds the shared gateway and no app: requests and jobs use a copy bound to their tenant scope.
	base := &commerce{gateway: newGateway(m.Config), wechatAppID: m.Config.WechatAppID}
	path := func(e *core.RequestEvent, name string) string { return e.Request.PathValue(name) }

	student := func(fn func(e *core.RequestEvent, c *commerce, studentID string) (any, error)) func(*core.RequestEvent) error {
		return m.Signer.RequireSession(func(e *core.RequestEvent) error {
			return Query(e, func() (any, error) {
				user := auth.User(e)
				id := auth.ClaimString(user, "id")
				if id == "" || user["role"] != "student" {
					return nil, Fail("STUDENT_LEARNING_STUDENT_REQUIRED", "仅学员可以购买课程", nil)
				}
				return fn(e, base.scoped(e.App), id)
			})
		})
	}
	finance := func(fn func(e *core.RequestEvent, c *commerce, actorID string) (any, error)) func(*core.RequestEvent) error {
		return m.Signer.RequireOps(false, func(e *core.RequestEvent) error {
			return Query(e, func() (any, error) {
				user := auth.User(e)
				if err := RequireCapability(user, Finance); err != nil {
					return nil, err
				}
				return fn(e, base.scoped(e.App), auth.ClaimString(user, "id"))
			})
		})
	}
	// withBody reads the JSON body before running a finance command.
	withBody := func(fn func(e *core.RequestEvent, c *commerce, body Body, actorID string) (any, error)) func(*core.RequestEvent) error {
		return finance(func(e *core.RequestEvent, c *commerce, actorID string) (any, error) {
			body, err := readJSONBody(e)
			if err != nil {
				return nil, err
			}
			return fn(e, c, body, actorID)
		})
	}
	// passthrough forwards a statement or recovery-work call to the gateway.
	passthrough := func(method string, target func(e *core.RequestEvent) string, input func(body Body, actorID string) (any, error)) func(*core.RequestEvent) error {
		if input == nil {
			return finance(func(e *core.RequestEvent, c *commerce, _ string) (any, error) {
				return c.gateway.request(method, target(e), nil, "", false)
			})
		}
		return withBody(func(e *core.RequestEvent, c *commerce, body Body, actorID string) (any, error) {
			payload, err := input(body, actorID)
			if err != nil {
				return nil, err
			}
			return c.gateway.request(method, target(e), payload, "", false)
		})
	}
	fixed := func(target string) func(*core.RequestEvent) string {
		return func(*core.RequestEvent) string { return target }
	}
	segment := func(prefix, name, suffix string) func(*core.RequestEvent) string {
		return func(e *core.RequestEvent) string { return prefix + encodeURIComponent(path(e, name)) + suffix }
	}
	withActor := func(body Body, actorID string, keys ...string) map[string]any {
		return pick(map[string]any{"actorId": actorID}, body.Values, keys...)
	}

	router.GET("/v1/student/commerce/catalog", student(func(_ *core.RequestEvent, c *commerce, _ string) (any, error) { return c.catalog() }))
	router.GET("/v1/student/commerce/orders", student(func(_ *core.RequestEvent, c *commerce, studentID string) (any, error) { return c.list(studentID) }))
	router.POST("/v1/student/commerce/orders", student(func(e *core.RequestEvent, c *commerce, studentID string) (any, error) {
		body, err := readJSONBody(e)
		if err != nil {
			return nil, err
		}
		return c.checkout(studentID, body, auth.User(e))
	}))
	router.POST("/v1/student/commerce/orders/{id}/cashier", student(func(e *core.RequestEvent, c *commerce, studentID string) (any, error) {
		return c.cashier(studentID, path(e, "id"), auth.User(e))
	}))
	router.GET("/v1/student/commerce/orders/{id}", student(func(e *core.RequestEvent, c *commerce, studentID string) (any, error) {
		return c.detail(studentID, path(e, "id"))
	}))
	router.POST("/v1/student/commerce/orders/{id}/refresh", student(func(e *core.RequestEvent, c *commerce, studentID string) (any, error) {
		if _, err := c.owned(studentID, path(e, "id")); err != nil {
			return nil, err
		}
		if err := c.sync(path(e, "id")); err != nil {
			return nil, err
		}
		return c.detail(studentID, path(e, "id"))
	}))
	if m.Config.Mock {
		router.POST("/v1/student/commerce/orders/{id}/mock-pay", student(func(e *core.RequestEvent, c *commerce, studentID string) (any, error) {
			return c.mockPay(studentID, path(e, "id"))
		}))
	}
	router.GET("/v1/student/commerce/orders/{id}/refund-preview", student(func(e *core.RequestEvent, c *commerce, studentID string) (any, error) {
		quote, err := c.refundPreview(studentID, path(e, "id"))
		if err != nil {
			return nil, err
		}
		return quote.public(), nil
	}))
	router.POST("/v1/student/commerce/orders/{id}/refunds", student(func(e *core.RequestEvent, c *commerce, studentID string) (any, error) {
		body, err := readJSONBody(e)
		if err != nil {
			return nil, err
		}
		return c.requestRefund(studentID, path(e, "id"), body.Get("key"), body.Get("expectedAmount"), nil)
	}))
	router.GET("/v1/student/commerce/refunds/{id}", student(func(e *core.RequestEvent, c *commerce, studentID string) (any, error) {
		return c.refundDetail(studentID, path(e, "id"))
	}))

	router.GET("/ops/commerce/finance", finance(func(_ *core.RequestEvent, c *commerce, _ string) (any, error) { return c.financeView() }))
	router.POST("/ops/commerce/reconcile", finance(func(_ *core.RequestEvent, c *commerce, _ string) (any, error) {
		return c.gateway.request(http.MethodPost, "/v1/reconciliation", map[string]any{}, "", false)
	}))
	router.POST("/ops/commerce/recover", finance(func(_ *core.RequestEvent, c *commerce, _ string) (any, error) {
		orders, err := c.recover()
		if err != nil {
			return nil, err
		}
		refunds, err := c.recoverRefunds()
		if err != nil {
			return nil, err
		}
		return map[string]any{"orders": orders, "refunds": refunds}, nil
	}))
	if m.Config.Mock {
		router.POST("/ops/commerce/refunds/{id}/mock-success", finance(func(e *core.RequestEvent, c *commerce, _ string) (any, error) {
			row, err := get(c.app, "commerce_refunds", path(e, "id"))
			if err != nil {
				return nil, err
			}
			gatewayID := asMap(row["data"])["gatewayId"]
			if row["status"] != "processing" || !jsx.Truthy(gatewayID) {
				return nil, Fail("REFUND_NOT_READY", "该退款当前不能模拟到账", nil)
			}
			if err := c.gateway.mockSuccess(jsx.String(gatewayID)); err != nil {
				return nil, err
			}
			if err := c.syncRefund(jsx.String(row["id"])); err != nil {
				return nil, err
			}
			return c.refundDetail(jsx.String(row["studentId"]), jsx.String(row["id"]))
		}))
	}

	router.GET("/ops/commerce/orders", finance(func(e *core.RequestEvent, c *commerce, _ string) (any, error) {
		return c.opsOrders(queryParams(e, "page", "perPage", "search", "status", "from", "to"))
	}))
	router.GET("/ops/commerce/orders/{id}", finance(func(e *core.RequestEvent, c *commerce, _ string) (any, error) { return c.opsDetail(path(e, "id")) }))
	router.POST("/ops/commerce/orders/{id}/refunds", withBody(func(e *core.RequestEvent, c *commerce, body Body, actorID string) (any, error) {
		return c.opsRefund(path(e, "id"), body, actorID)
	}))
	router.POST("/ops/commerce/orders/{id}/recover", withBody(func(e *core.RequestEvent, c *commerce, body Body, actorID string) (any, error) {
		return c.recoverOrder(path(e, "id"), body, actorID)
	}))
	router.POST("/ops/commerce/refunds/{id}/retry", withBody(func(e *core.RequestEvent, c *commerce, body Body, actorID string) (any, error) {
		reason, err := validateReason(body.Get("reason"))
		if err != nil {
			return nil, err
		}
		return c.retryLiability(path(e, "id"), map[string]any{"id": actorID, "reason": reason})
	}))
	router.GET("/ops/commerce/offers", finance(func(_ *core.RequestEvent, c *commerce, _ string) (any, error) { return c.offers() }))
	router.POST("/ops/commerce/offers", withBody(func(_ *core.RequestEvent, c *commerce, body Body, actorID string) (any, error) {
		return c.saveOffer(body, actorID)
	}))
	router.POST("/ops/commerce/offers/{id}/status", withBody(func(e *core.RequestEvent, c *commerce, body Body, actorID string) (any, error) {
		return c.transitionOffer(path(e, "id"), body, actorID)
	}))
	router.GET("/ops/commerce/cases", finance(func(_ *core.RequestEvent, c *commerce, _ string) (any, error) { return c.cases() }))
	router.POST("/ops/commerce/cases/{id}", withBody(func(e *core.RequestEvent, c *commerce, body Body, actorID string) (any, error) {
		return c.updateCase(path(e, "id"), body, actorID)
	}))

	router.GET("/ops/commerce/statements", passthrough(http.MethodGet, fixed("/v1/statements"), nil))
	router.GET("/ops/commerce/statements/{id}", passthrough(http.MethodGet, segment("/v1/statements/", "id", ""), nil))
	router.GET("/ops/commerce/statements/{id}/export", passthrough(http.MethodGet, segment("/v1/statements/", "id", "/export"), nil))
	router.POST("/ops/commerce/statements/download", passthrough(http.MethodPost, fixed("/v1/statements/download"),
		func(body Body, actorID string) (any, error) { return withActor(body, actorID, "date"), nil }))
	router.POST("/ops/commerce/statements/import", passthrough(http.MethodPost, fixed("/v1/statements/import"),
		func(body Body, actorID string) (any, error) { return withActor(body, actorID, "date", "content"), nil }))
	router.POST("/ops/commerce/statements/{id}/settlement", passthrough(http.MethodPost, segment("/v1/statements/", "id", "/settlement"),
		func(body Body, actorID string) (any, error) {
			return withActor(body, actorID, "reference", "amount", "evidenceHash", "date"), nil
		}))
	router.POST("/ops/commerce/statement-lines/{id}/resolve", passthrough(http.MethodPost, segment("/v1/statement-lines/", "id", "/resolve"),
		func(body Body, actorID string) (any, error) {
			note, err := validateReason(body.Get("note"))
			return map[string]any{"actorId": actorID, "note": note}, err
		}))
	router.GET("/ops/commerce/recovery-work", passthrough(http.MethodGet, fixed("/v1/work"), nil))
	router.POST("/ops/commerce/recovery-work/{id}/retry", passthrough(http.MethodPost, segment("/v1/work/", "id", "/retry"),
		func(body Body, actorID string) (any, error) {
			reason, err := validateReason(body.Get("reason"))
			return map[string]any{"actorId": actorID, "reason": reason}, err
		}))

	if len(m.Config.EventToken) >= 32 {
		router.POST("/internal/commerce/payment-events", func(e *core.RequestEvent) error {
			return m.paymentEvent(e, base.scoped(e.App))
		})
	}
	m.startRecovery(se.App, base)
}

// paymentEvent is the gateway's push: it answers raw JSON, not the API envelope,
// and any failure is left for the recovery job (503 lets the gateway retry).
func (m CommerceModule) paymentEvent(e *core.RequestEvent, c *commerce) error {
	received := []byte(e.Request.Header.Get("Authorization"))
	expected := []byte("Bearer " + m.Config.EventToken)
	if subtle.ConstantTimeCompare(received, expected) != 1 {
		return e.JSON(http.StatusUnauthorized, map[string]any{"error": "UNAUTHORIZED"})
	}
	pending := func() error {
		return e.JSON(http.StatusServiceUnavailable, map[string]any{"error": "RECOVERY_PENDING"})
	}
	raw, err := io.ReadAll(e.Request.Body)
	if err != nil {
		return pending()
	}
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return pending()
	}
	body := asMap(value)
	reference, ok := body["reference"].(string)
	if body == nil || !ok || jsx.Length(reference) > 100 {
		return e.JSON(http.StatusBadRequest, map[string]any{"error": "INVALID_EVENT"})
	}
	kind := jsx.String(jsx.Get(body, "type"))
	mismatch := func() error { return e.JSON(http.StatusConflict, map[string]any{"error": "EVENT_MISMATCH"}) }
	switch {
	case strings.HasPrefix(kind, "payment."):
		row, err := get(c.app, "commerce_orders", recordID(reference))
		if err != nil {
			return pending()
		}
		if asMap(row["data"])["paymentId"] != jsx.Get(body, "targetId") {
			return mismatch()
		}
		if err := c.sync(jsx.String(row["id"])); err != nil {
			return pending()
		}
		updated, err := get(c.app, "commerce_orders", jsx.String(row["id"]))
		if err != nil {
			return pending()
		}
		if updated["status"] != "completed" && updated["status"] != "failed" {
			return e.JSON(http.StatusServiceUnavailable, map[string]any{"error": "FULFILLMENT_PENDING"})
		}
	case strings.HasPrefix(kind, "refund."):
		row, err := c.refundByReference(reference)
		if err != nil {
			return pending()
		}
		if row == nil || asMap(row["data"])["gatewayId"] != jsx.Get(body, "targetId") {
			return mismatch()
		}
		if err := c.syncRefund(jsx.String(row["id"])); err != nil {
			return pending()
		}
	default:
		return e.JSON(http.StatusBadRequest, map[string]any{"error": "INVALID_EVENT"})
	}
	return e.NoContent(http.StatusNoContent)
}

// startRecovery runs Hono's commerce-worker in process: retry unfinished orders
// and refunds, skipping a tick while the previous one still runs.
func (m CommerceModule) startRecovery(app core.App, c *commerce) {
	if m.RecoveryInterval <= 0 {
		return
	}
	var running sync.Mutex
	tick := func() {
		if !running.TryLock() {
			return
		}
		defer running.Unlock()
		err := tenancy.Each(app, func(scoped core.App) error {
			if !tenancy.PluginEnabled(scoped, tenancy.ID(scoped), tenancy.Payment) {
				return nil
			}
			tenant := c.scoped(scoped)
			orders, err := tenant.recover()
			if err != nil {
				return err
			}
			refunds, err := tenant.recoverRefunds()
			if err != nil {
				return err
			}
			if orders["unresolved"] != 0 || refunds["unresolved"] != 0 {
				app.Logger().Error("Commerce recovery has unresolved work.", "tenant", tenancy.ID(scoped))
			}
			return nil
		})
		if err != nil {
			app.Logger().Error("Commerce worker temporarily unavailable; pending records retained.")
		}
	}
	ticker := time.NewTicker(m.RecoveryInterval)
	done := make(chan struct{})
	go func() {
		tick()
		for {
			select {
			case <-ticker.C:
				tick()
			case <-done:
				return
			}
		}
	}()
	app.OnTerminate().BindFunc(func(e *core.TerminateEvent) error {
		ticker.Stop()
		close(done)
		// Wait out a tick in flight; the lock stays held so no later tick starts.
		running.Lock()
		return e.Next()
	})
}
