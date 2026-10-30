// Package payment is the payment plugin: it only moves money. It creates and
// queries payments and refunds at kanyue.pay, receives its callbacks, recovers
// unsettled money and runs reconciliation and money cases. Orders, refund
// requests and credit belong to the core order center (coursecredit); the
// plugin reaches them only through the order center's exported commands, so
// switching the plugin off never takes an order or a lesson away.
package payment

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
	"kanyue.server/internal/coursecredit"
	"kanyue.server/internal/jsx"
	"kanyue.server/internal/tenancy"
)

// Config is how the plugin reaches kanyue.pay.
type Config struct {
	GatewayURL   string
	ServiceToken string
	MockToken    string
	EventToken   string
	// Mock is NODE_ENV development/test with PAY_MOCK_ENABLED=true.
	Mock bool
}

// Module registers the plugin's routes, the gateway callback and the recovery job.
type Module struct {
	Signer *auth.Signer
	// Enabled is COURSE_COMMERCE_ENABLED=true; otherwise no route is registered.
	Enabled bool
	Config  Config
	// RecoveryInterval is the recovery job's period; zero disables the job.
	RecoveryInterval time.Duration
}

func (m Module) Register(se *core.ServeEvent) {
	if !m.Enabled {
		return
	}
	router := se.Router
	// base holds the shared gateway and no app: requests and jobs use a copy bound to their tenant scope.
	base := &service{gateway: newGateway(m.Config)}
	path := func(e *core.RequestEvent, name string) string { return e.Request.PathValue(name) }
	start := tenancy.Needs(tenancy.Payment, tenancy.StartPayment)
	settle := tenancy.Needs(tenancy.Payment, tenancy.SettleMoney)

	student := func(fn func(e *core.RequestEvent, s *service, studentID string) (any, error)) func(*core.RequestEvent) error {
		return m.Signer.RequireSession(func(e *core.RequestEvent) error {
			return coursecredit.Query(e, func() (any, error) {
				id, err := coursecredit.StudentOf(e)
				if err != nil {
					return nil, err
				}
				return fn(e, base.scoped(e.App), id)
			})
		})
	}
	finance := func(fn func(e *core.RequestEvent, s *service, actorID string) (any, error)) func(*core.RequestEvent) error {
		return m.Signer.RequireOps(false, func(e *core.RequestEvent) error {
			return coursecredit.Query(e, func() (any, error) {
				actorID, err := coursecredit.FinanceActor(e)
				if err != nil {
					return nil, err
				}
				return fn(e, base.scoped(e.App), actorID)
			})
		})
	}
	// withBody reads the JSON body before running a finance command.
	withBody := func(fn func(e *core.RequestEvent, s *service, body coursecredit.Body, actorID string) (any, error)) func(*core.RequestEvent) error {
		return finance(func(e *core.RequestEvent, s *service, actorID string) (any, error) {
			body, err := coursecredit.ReadJSONBody(e)
			if err != nil {
				return nil, err
			}
			return fn(e, s, body, actorID)
		})
	}
	// passthrough forwards a statement or recovery-work call to the gateway.
	passthrough := func(method string, target func(e *core.RequestEvent) string, input func(body coursecredit.Body, actorID string) (any, error)) func(*core.RequestEvent) error {
		if input == nil {
			return finance(func(e *core.RequestEvent, s *service, _ string) (any, error) {
				return s.gateway.request(method, target(e), nil, "", false)
			})
		}
		return withBody(func(e *core.RequestEvent, s *service, body coursecredit.Body, actorID string) (any, error) {
			payload, err := input(body, actorID)
			if err != nil {
				return nil, err
			}
			return s.gateway.request(method, target(e), payload, "", false)
		})
	}
	fixed := func(target string) func(*core.RequestEvent) string {
		return func(*core.RequestEvent) string { return target }
	}
	segment := func(prefix, name, suffix string) func(*core.RequestEvent) string {
		return func(e *core.RequestEvent) string { return prefix + encodeURIComponent(path(e, name)) + suffix }
	}
	withActor := func(body coursecredit.Body, actorID string, keys ...string) map[string]any {
		return pick(map[string]any{"actorId": actorID}, body.Values, keys...)
	}

	router.POST("/v1/student/commerce/orders/{id}/cashier", student(func(e *core.RequestEvent, s *service, studentID string) (any, error) {
		return s.cashier(studentID, path(e, "id"), auth.User(e))
	})).BindFunc(start)
	router.POST("/v1/student/commerce/orders/{id}/refresh", student(func(e *core.RequestEvent, s *service, studentID string) (any, error) {
		if _, err := s.owned(studentID, path(e, "id")); err != nil {
			return nil, err
		}
		if err := s.sync(path(e, "id"), false); err != nil {
			return nil, err
		}
		return coursecredit.StudentOrderView(s.app, studentID, path(e, "id"), s.gateway.mock)
	})).BindFunc(settle)
	if m.Config.Mock {
		router.POST("/v1/student/commerce/orders/{id}/mock-pay", student(func(e *core.RequestEvent, s *service, studentID string) (any, error) {
			return s.mockPay(studentID, path(e, "id"))
		})).BindFunc(start)
		router.POST("/ops/commerce/refunds/{id}/mock-success", finance(func(e *core.RequestEvent, s *service, _ string) (any, error) {
			return s.mockRefund(path(e, "id"))
		})).BindFunc(settle)
	}

	router.GET("/ops/commerce/finance", finance(func(_ *core.RequestEvent, s *service, _ string) (any, error) {
		return s.financeView()
	})).BindFunc(settle)
	router.POST("/ops/commerce/reconcile", finance(func(_ *core.RequestEvent, s *service, _ string) (any, error) {
		return s.gateway.request(http.MethodPost, "/v1/reconciliation", map[string]any{}, "", false)
	})).BindFunc(settle)
	router.POST("/ops/commerce/recover", finance(func(_ *core.RequestEvent, s *service, _ string) (any, error) {
		orders, err := s.recover()
		if err != nil {
			return nil, err
		}
		refunds, err := s.recoverRefunds()
		if err != nil {
			return nil, err
		}
		return map[string]any{"orders": orders, "refunds": refunds}, nil
	})).BindFunc(settle)
	router.POST("/ops/commerce/orders/{id}/recover", withBody(func(e *core.RequestEvent, s *service, body coursecredit.Body, actorID string) (any, error) {
		return s.recoverOrder(path(e, "id"), body, actorID)
	})).BindFunc(settle)
	router.POST("/ops/commerce/refunds/{id}/retry", withBody(func(e *core.RequestEvent, s *service, body coursecredit.Body, actorID string) (any, error) {
		reason, err := coursecredit.ValidateReason(body.Get("reason"))
		if err != nil {
			return nil, err
		}
		return s.retry(path(e, "id"), map[string]any{"id": actorID, "reason": reason})
	})).BindFunc(settle)
	router.GET("/ops/commerce/cases", finance(func(_ *core.RequestEvent, s *service, _ string) (any, error) {
		return s.cases()
	})).BindFunc(settle)
	router.POST("/ops/commerce/cases/{id}", withBody(func(e *core.RequestEvent, s *service, body coursecredit.Body, actorID string) (any, error) {
		return s.updateCase(path(e, "id"), body, actorID)
	})).BindFunc(settle)

	router.GET("/ops/commerce/statements", passthrough(http.MethodGet, fixed("/v1/statements"), nil)).BindFunc(settle)
	router.GET("/ops/commerce/statements/{id}", passthrough(http.MethodGet, segment("/v1/statements/", "id", ""), nil)).BindFunc(settle)
	router.GET("/ops/commerce/statements/{id}/export", passthrough(http.MethodGet, segment("/v1/statements/", "id", "/export"), nil)).BindFunc(settle)
	router.POST("/ops/commerce/statements/download", passthrough(http.MethodPost, fixed("/v1/statements/download"),
		func(body coursecredit.Body, actorID string) (any, error) {
			return withActor(body, actorID, "date"), nil
		})).BindFunc(settle)
	router.POST("/ops/commerce/statements/import", passthrough(http.MethodPost, fixed("/v1/statements/import"),
		func(body coursecredit.Body, actorID string) (any, error) {
			return withActor(body, actorID, "date", "content"), nil
		})).BindFunc(settle)
	router.POST("/ops/commerce/statements/{id}/settlement", passthrough(http.MethodPost, segment("/v1/statements/", "id", "/settlement"),
		func(body coursecredit.Body, actorID string) (any, error) {
			return withActor(body, actorID, "reference", "amount", "evidenceHash", "date"), nil
		})).BindFunc(settle)
	router.POST("/ops/commerce/statement-lines/{id}/resolve", passthrough(http.MethodPost, segment("/v1/statement-lines/", "id", "/resolve"),
		func(body coursecredit.Body, actorID string) (any, error) {
			note, err := coursecredit.ValidateReason(body.Get("note"))
			return map[string]any{"actorId": actorID, "note": note}, err
		})).BindFunc(settle)
	router.GET("/ops/commerce/recovery-work", passthrough(http.MethodGet, fixed("/v1/work"), nil)).BindFunc(settle)
	router.POST("/ops/commerce/recovery-work/{id}/retry", passthrough(http.MethodPost, segment("/v1/work/", "id", "/retry"),
		func(body coursecredit.Body, actorID string) (any, error) {
			reason, err := coursecredit.ValidateReason(body.Get("reason"))
			return map[string]any{"actorId": actorID, "reason": reason}, err
		})).BindFunc(settle)

	if len(m.Config.EventToken) >= 32 {
		router.POST("/internal/commerce/payment-events", func(e *core.RequestEvent) error {
			return m.paymentEvent(e, base.scoped(e.App))
		}).BindFunc(settle)
	}
	m.startRecovery(se.App, base)
}

// paymentEvent is the gateway's push: it answers raw JSON, not the API envelope,
// and any failure is left for the recovery job (503 lets the gateway retry).
func (m Module) paymentEvent(e *core.RequestEvent, s *service) error {
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
		record, err := paymentOf(s.app, reference)
		if err != nil || record == nil {
			return pending()
		}
		if record.GetString("gatewayId") != jsx.Get(body, "targetId") {
			return mismatch()
		}
		if err := s.sync(reference, false); err != nil {
			return pending()
		}
		order, err := coursecredit.PayableOrder(s.app, reference)
		if err != nil {
			return pending()
		}
		if order.Status != "completed" && order.Status != "failed" {
			return e.JSON(http.StatusServiceUnavailable, map[string]any{"error": "FULFILLMENT_PENDING"})
		}
	case strings.HasPrefix(kind, "refund."):
		record, err := s.refundByReference(reference)
		if err != nil {
			return pending()
		}
		if record == nil || record.GetString("gatewayId") != jsx.Get(body, "targetId") {
			return mismatch()
		}
		if err := s.syncRefund(record.GetString("refundId")); err != nil {
			return pending()
		}
	default:
		return e.JSON(http.StatusBadRequest, map[string]any{"error": "INVALID_EVENT"})
	}
	return e.NoContent(http.StatusNoContent)
}

// startRecovery settles unsettled payments and refunds in process for every
// tenant whose plugin may still settle money, skipping a tick while the
// previous one still runs.
func (m Module) startRecovery(app core.App, base *service) {
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
			if !tenancy.Allows(scoped, tenancy.ID(scoped), tenancy.Payment, tenancy.SettleMoney) {
				return nil
			}
			tenant := base.scoped(scoped)
			orders, err := tenant.recover()
			if err != nil {
				return err
			}
			refunds, err := tenant.recoverRefunds()
			if err != nil {
				return err
			}
			if orders["unresolved"] != 0 || refunds["unresolved"] != 0 {
				app.Logger().Error("Payment recovery has unresolved work.", "tenant", tenancy.ID(scoped))
			}
			return nil
		})
		if err != nil {
			app.Logger().Error("Payment worker temporarily unavailable; pending records retained.")
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
