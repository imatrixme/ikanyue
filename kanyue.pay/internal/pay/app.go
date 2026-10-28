package pay

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/router"
)

const (
	bodyLimit      = 16 * 1024
	statementLimit = 2 * 1024 * 1024
)

var errTooLarge = errors.New("body too large")

type handler func(e *core.RequestEvent) (int, any, error)

// handle maps gateway errors to {error: CODE}; anything uncoded is 503 and logged.
func handle(fn handler) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		status, body, err := fn(e)
		if err == nil {
			if status == http.StatusNoContent {
				return e.NoContent(status)
			}
			return e.JSON(status, body)
		}
		var coded *Error
		switch {
		case errors.As(err, &coded):
			return e.JSON(coded.Status, map[string]any{"error": coded.Code})
		case errors.Is(err, errTooLarge):
			return e.JSON(http.StatusRequestEntityTooLarge, map[string]any{"error": "REQUEST_REJECTED"})
		}
		e.App.Logger().Error("Payment request failed", "path", e.Request.URL.Path, "error", err.Error())
		return e.JSON(http.StatusServiceUnavailable, map[string]any{"error": "GATEWAY_UNAVAILABLE"})
	}
}

func rawBody(e *core.RequestEvent, limit int64) (string, error) {
	raw, err := io.ReadAll(io.LimitReader(e.Request.Body, limit+1))
	if err != nil {
		return "", err
	}
	if int64(len(raw)) > limit {
		return "", errTooLarge
	}
	return string(raw), nil
}

func body(e *core.RequestEvent, limit int64) (map[string]any, error) {
	raw, err := rawBody(e, limit)
	if err != nil {
		return nil, err
	}
	var value any
	if err := json.Unmarshal([]byte(raw), &value); err != nil {
		return nil, fail("INVALID_JSON", 400)
	}
	object, ok := value.(map[string]any)
	if !ok {
		return nil, fail("INVALID_BODY", 400)
	}
	return object, nil
}

func bearer(token string) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		if !equalSecret(e.Request.Header.Get("Authorization"), "Bearer "+token) {
			return e.JSON(http.StatusUnauthorized, map[string]any{"error": "UNAUTHORIZED"})
		}
		return e.Next()
	}
}

// present hides fingerprints, payer ids and prepay ids, and adds the launch action of a pending payment.
func present(row Row, svc Service) (map[string]any, error) {
	result := map[string]any{"id": row.ID}
	for key, value := range row.Data {
		if key != "fingerprint" && key != "payerId" && key != "prepayId" {
			result[key] = value
		}
	}
	if row.Kind == "payment" && str(row.Data, "status") == "pending" {
		action, err := svc.Action(row)
		if err != nil {
			return nil, err
		}
		result["action"] = action
	}
	return result, nil
}

// Register binds the gateway API to the embedded PocketBase router.
func Register(se *core.ServeEvent, svc Service, cfg Config) {
	g := svc.Core()
	routes := se.Router
	// PocketBase's SQL console would make the read-only dashboard a way to rewrite payments.
	routes.BindFunc(func(e *core.RequestEvent) error {
		if strings.TrimSuffix(e.Request.URL.Path, "/") == "/api/sql" {
			return e.ForbiddenError("The SQL console is disabled.", nil)
		}
		return e.Next()
	})
	routes.GET("/health", func(e *core.RequestEvent) error {
		return e.JSON(http.StatusOK, map[string]any{"service": "kanyue.pay", "provider": cfg.Provider, "status": "ok"})
	})
	routes.GET("/ready", handle(func(e *core.RequestEvent) (int, any, error) {
		_, err := g.Store.List("payment", g.Owner, nil)
		return http.StatusOK, map[string]any{"status": "ready"}, err
	}))
	presented := func(status int, row Row, err error) (int, any, error) {
		if err != nil {
			return 0, nil, err
		}
		result, err := present(row, svc)
		return status, result, err
	}

	v1 := routes.Group("/v1")
	v1.BindFunc(bearer(cfg.Token))
	v1.POST("/payments", handle(func(e *core.RequestEvent) (int, any, error) {
		input, err := body(e, bodyLimit)
		if err != nil {
			return 0, nil, err
		}
		row, err := svc.CreatePayment(input, e.Request.Header.Get("Idempotency-Key"))
		return presented(http.StatusCreated, row, err)
	}))
	v1.GET("/payments/{id}", handle(func(e *core.RequestEvent) (int, any, error) {
		row, err := g.Owned(e.Request.PathValue("id"), "payment")
		return presented(http.StatusOK, row, err)
	}))
	v1.POST("/payments/{id}/close", handle(func(e *core.RequestEvent) (int, any, error) {
		row, err := svc.ClosePayment(e.Request.PathValue("id"))
		return presented(http.StatusOK, row, err)
	}))
	v1.POST("/refunds", handle(func(e *core.RequestEvent) (int, any, error) {
		input, err := body(e, bodyLimit)
		if err != nil {
			return 0, nil, err
		}
		row, err := svc.CreateRefund(input, e.Request.Header.Get("Idempotency-Key"))
		return presented(http.StatusCreated, row, err)
	}))
	v1.GET("/refunds/{id}", handle(func(e *core.RequestEvent) (int, any, error) {
		row, err := g.Owned(e.Request.PathValue("id"), "refund")
		return presented(http.StatusOK, row, err)
	}))
	v1.GET("/events", handle(func(e *core.RequestEvent) (int, any, error) {
		rows, err := g.Events()
		return http.StatusOK, map[string]any{"items": rows}, err
	}))
	v1.POST("/events/{id}/ack", handle(func(e *core.RequestEvent) (int, any, error) {
		return http.StatusOK, map[string]any{"acknowledged": true}, g.Acknowledge(e.Request.PathValue("id"))
	}))
	v1.GET("/finance", handle(func(e *core.RequestEvent) (int, any, error) {
		summary, err := FinancialSummary(g.Store, g.Owner)
		if err == nil && cfg.Live {
			summary["provider"] = "wechatpay"
		}
		return http.StatusOK, summary, err
	}))
	v1.GET("/work", handle(func(e *core.RequestEvent) (int, any, error) {
		rows, err := g.Store.List("work", g.Owner, nil)
		return http.StatusOK, map[string]any{"items": rows}, err
	}))
	v1.POST("/work/{id}/retry", handle(func(e *core.RequestEvent) (int, any, error) {
		input, err := body(e, bodyLimit)
		if err != nil {
			return 0, nil, err
		}
		err = NewDurableWork(g.Store, g.Owner).Reset(e.Request.PathValue("id"), truthyString(input["actorId"]), truthyString(input["reason"]))
		return http.StatusOK, map[string]any{"resumed": true}, err
	}))
	v1.POST("/reconciliation", handle(func(e *core.RequestEvent) (int, any, error) {
		result, err := Reconcile(g.Store, g.Owner, nowISO())
		return http.StatusOK, result, err
	}))

	wechat, isWechat := svc.(*WechatGateway)
	if isWechat {
		registerStatements(v1, wechat)
		v1.POST("/payments/{id}/refresh", handle(func(e *core.RequestEvent) (int, any, error) {
			id := e.Request.PathValue("id")
			if _, err := wechat.RecoverTarget(id, "payment"); err != nil {
				return 0, nil, err
			}
			row, err := g.Owned(id, "payment")
			return presented(http.StatusOK, row, err)
		}))
		v1.GET("/providers/wechatpay/bills/{date}", handle(func(e *core.RequestEvent) (int, any, error) {
			bill, err := wechat.Adapter.Client.Bill(e.Request.PathValue("date"))
			return http.StatusOK, bill, err
		}))
		// The public callback is authenticated cryptographically, not by token.
		routes.POST("/callbacks/wechatpay", handle(func(e *core.RequestEvent) (int, any, error) {
			raw, err := rawBody(e, bodyLimit)
			if err != nil {
				return 0, nil, err
			}
			return http.StatusNoContent, nil, wechat.Notification(e.Request.Header, raw)
		}))
	}

	if !cfg.MockControls() {
		return
	}
	controls := routes.Group("/_test")
	controls.BindFunc(bearer(cfg.MockToken))
	controls.POST("/observations/{id}", handle(func(e *core.RequestEvent) (int, any, error) {
		input, err := body(e, bodyLimit)
		if err != nil {
			return 0, nil, err
		}
		row, err := svc.Observe(e.Request.PathValue("id"), input)
		return http.StatusOK, row, err
	}))
	controls.POST("/poll", handle(func(e *core.RequestEvent) (int, any, error) {
		// Test controls advance the peer immediately, without durable backoff.
		subject := svc
		if isWechat {
			peer, err := wechat.Mock()
			if err != nil {
				return 0, nil, err
			}
			subject = NewMockWechatGateway(g.Store, g.Owner, peer.Keys, nil)
		}
		result, err := subject.Poll()
		return http.StatusOK, result, err
	}))
	if isWechat {
		controls.POST("/wechatpay/notify/{id}", handle(func(e *core.RequestEvent) (int, any, error) {
			id := e.Request.PathValue("id")
			if _, err := g.Owned(recordID("provider", id), "provider"); err != nil {
				return 0, nil, err
			}
			peer, err := wechat.Mock()
			if err != nil {
				return 0, nil, err
			}
			header, raw, err := peer.Notification(id)
			if err != nil {
				return 0, nil, err
			}
			return http.StatusOK, map[string]any{"delivered": true}, wechat.Notification(header, raw)
		}))
	}
}

func registerStatements(v1 *router.RouterGroup[*core.RequestEvent], wechat *WechatGateway) {
	client := wechat.Adapter.Client
	service := &Statements{Gateway: wechat.Gateway, MerchantID: client.Credentials.MerchantID, AppID: client.Credentials.AppID}
	g := wechat.Gateway
	v1.GET("/statements", handle(func(e *core.RequestEvent) (int, any, error) {
		rows, err := g.Store.List("statement", g.Owner, nil)
		items := make([]map[string]any, len(rows))
		for i, row := range rows {
			items[i] = withID(row)
		}
		sort.SliceStable(items, func(a, b int) bool { return str(items[a], "date") > str(items[b], "date") })
		return http.StatusOK, map[string]any{"items": items}, err
	}))
	v1.GET("/statements/{id}", handle(func(e *core.RequestEvent) (int, any, error) {
		detail, err := service.Detail(e.Request.PathValue("id"))
		return http.StatusOK, detail, err
	}))
	v1.POST("/statements/download", handle(func(e *core.RequestEvent) (int, any, error) {
		input, err := body(e, bodyLimit)
		if err != nil {
			return 0, nil, err
		}
		actorID, _ := input["actorId"].(string)
		if actorID == "" {
			return 0, nil, fail("ACTOR_REQUIRED", 400)
		}
		date := jsString(input["date"])
		// A live bill exists only after the China day closes.
		if !client.Mock && !(date < chinaToday()) {
			return 0, nil, fail("STATEMENT_NOT_GENERATED", 400)
		}
		bill, err := client.Bill(date)
		if err != nil {
			return 0, nil, err
		}
		detail, err := service.Import(StatementImport{Date: bill.Date, Content: bill.Content, Mock: bill.Mock, Source: "channel", ActorID: actorID})
		return http.StatusOK, detail, err
	}))
	v1.POST("/statements/import", handle(func(e *core.RequestEvent) (int, any, error) {
		input, err := body(e, statementLimit)
		if err != nil {
			return 0, nil, err
		}
		content, contentOK := input["content"].(string)
		date, dateOK := input["date"].(string)
		actorID, _ := input["actorId"].(string)
		if !contentOK || !dateOK || actorID == "" {
			return 0, nil, fail("INVALID_STATEMENT", 400)
		}
		detail, err := service.Import(StatementImport{Date: date, Content: content, Mock: client.Mock, Source: "manual", ActorID: actorID})
		return http.StatusOK, detail, err
	}))
	v1.POST("/statement-lines/{id}/resolve", handle(func(e *core.RequestEvent) (int, any, error) {
		input, err := body(e, bodyLimit)
		if err != nil {
			return 0, nil, err
		}
		err = service.Review(e.Request.PathValue("id"), truthyString(input["actorId"]), truthyString(input["note"]))
		return http.StatusOK, map[string]any{"resolved": true}, err
	}))
	v1.POST("/statements/{id}/settlement", handle(func(e *core.RequestEvent) (int, any, error) {
		input, err := body(e, bodyLimit)
		if err != nil {
			return 0, nil, err
		}
		result, err := service.Settlement(e.Request.PathValue("id"), input)
		return http.StatusOK, result, err
	}))
	v1.GET("/statements/{id}/export", handle(func(e *core.RequestEvent) (int, any, error) {
		content, err := service.Export(e.Request.PathValue("id"))
		return http.StatusOK, map[string]any{"content": content}, err
	}))
}

// StartWorker polls the channel and pushes events every interval, skipping a
// tick while the previous one still runs.
func StartWorker(app core.App, svc Service, work *DurableWork, cfg Config) {
	var running sync.Mutex
	tick := func() {
		if !running.TryLock() {
			return
		}
		defer running.Unlock()
		result, err := svc.Poll()
		if err == nil {
			err = DeliverEvents(svc.Core(), work, cfg.Events, paymentCallbacks)
		}
		if err != nil {
			app.Logger().Error("Payment worker temporarily unavailable; durable work retained.", "error", err.Error())
		} else if len(result.Errors) > 0 {
			app.Logger().Error("Payment polling has unresolved observations.", "count", len(result.Errors))
		}
	}
	ticker := time.NewTicker(cfg.Interval)
	done := make(chan struct{})
	go func() {
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
		running.Lock()
		return e.Next()
	})
}

// Build wires the configured provider over the embedded store.
func Build(app core.App, cfg Config) (Service, *DurableWork, error) {
	store := PocketBaseStore{App: app}
	work := NewDurableWork(store, cfg.Owner)
	switch {
	case cfg.Live:
		credentials, err := LiveCredentials(cfg.CredentialFile)
		if err != nil {
			return nil, nil, err
		}
		transport, err := LiveTransport(cfg.Live)
		if err != nil {
			return nil, nil, err
		}
		adapter := &WechatAdapter{Client: &WechatClient{Credentials: credentials, Transport: transport, Mock: false}}
		return NewLiveWechatGateway(store, cfg.Owner, adapter, work), work, nil
	case cfg.Provider == "wechatpay-mock":
		return NewMockWechatGateway(store, cfg.Owner, MockCredentials(), work), work, nil
	}
	return NewGateway(store, cfg.Owner), work, nil
}
