package coursecredit

import (
	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/tenancy"
)

// OrdersModule is the order center: what students can buy, their orders,
// refund requests and the operators' order views. It never moves money; the
// payment plugin collects and refunds through the commands in orders_payment.go.
// Selling and checkout need the plugin able to start a payment; everything
// else keeps working in every plugin state.
type OrdersModule struct {
	Signer *auth.Signer
	// Enabled is COURSE_COMMERCE_ENABLED=true; otherwise no route is registered.
	Enabled bool
	// WechatAppID binds an online order to the payer's WeChat identity.
	WechatAppID string
	// MockPayment tells clients the order can be paid on the mock channel.
	MockPayment bool
}

func (m OrdersModule) Register(se *core.ServeEvent) {
	if !m.Enabled {
		return
	}
	router := se.Router
	base := &orderCenter{wechatAppID: m.WechatAppID, mock: m.MockPayment}
	path := func(e *core.RequestEvent, name string) string { return e.Request.PathValue(name) }
	selling := tenancy.Needs(tenancy.Payment, tenancy.StartPayment)

	student := func(fn func(e *core.RequestEvent, c *orderCenter, studentID string) (any, error)) func(*core.RequestEvent) error {
		return m.Signer.RequireSession(func(e *core.RequestEvent) error {
			return Query(e, func() (any, error) {
				id, err := StudentOf(e)
				if err != nil {
					return nil, err
				}
				return fn(e, base.scoped(e.App), id)
			})
		})
	}
	finance := func(fn func(e *core.RequestEvent, c *orderCenter, body Body, actorID string) (any, error), withBody bool) func(*core.RequestEvent) error {
		return m.Signer.RequireOps(false, func(e *core.RequestEvent) error {
			return Query(e, func() (any, error) {
				actorID, err := FinanceActor(e)
				if err != nil {
					return nil, err
				}
				body := Body{Values: map[string]any{}}
				if withBody {
					if body, err = ReadJSONBody(e); err != nil {
						return nil, err
					}
				}
				return fn(e, base.scoped(e.App), body, actorID)
			})
		})
	}

	router.GET("/v1/student/commerce/catalog", student(func(_ *core.RequestEvent, c *orderCenter, _ string) (any, error) {
		return c.catalog()
	})).BindFunc(selling)
	router.GET("/v1/student/commerce/orders", student(func(_ *core.RequestEvent, c *orderCenter, studentID string) (any, error) {
		return c.list(studentID)
	}))
	router.POST("/v1/student/commerce/orders", student(func(e *core.RequestEvent, c *orderCenter, studentID string) (any, error) {
		body, err := ReadJSONBody(e)
		if err != nil {
			return nil, err
		}
		return c.checkout(studentID, body, auth.User(e))
	})).BindFunc(selling)
	router.GET("/v1/student/commerce/orders/{id}", student(func(e *core.RequestEvent, c *orderCenter, studentID string) (any, error) {
		return c.detail(studentID, path(e, "id"))
	}))
	router.GET("/v1/student/commerce/orders/{id}/refund-preview", student(func(e *core.RequestEvent, c *orderCenter, studentID string) (any, error) {
		quote, err := c.refundPreview(studentID, path(e, "id"))
		if err != nil {
			return nil, err
		}
		return quote.public(), nil
	}))
	router.POST("/v1/student/commerce/orders/{id}/refunds", student(func(e *core.RequestEvent, c *orderCenter, studentID string) (any, error) {
		body, err := ReadJSONBody(e)
		if err != nil {
			return nil, err
		}
		return c.requestRefund(studentID, path(e, "id"), body.Get("key"), body.Get("expectedAmount"), nil)
	}))
	router.GET("/v1/student/commerce/refunds/{id}", student(func(e *core.RequestEvent, c *orderCenter, studentID string) (any, error) {
		return c.refundDetail(studentID, path(e, "id"))
	}))

	router.GET("/ops/commerce/orders", finance(func(e *core.RequestEvent, c *orderCenter, _ Body, _ string) (any, error) {
		return c.opsOrders(queryParams(e, "page", "perPage", "search", "status", "from", "to"))
	}, false))
	router.GET("/ops/commerce/orders/{id}", finance(func(e *core.RequestEvent, c *orderCenter, _ Body, _ string) (any, error) {
		return c.opsDetail(path(e, "id"))
	}, false))
	router.POST("/ops/commerce/orders/{id}/refunds", finance(func(e *core.RequestEvent, c *orderCenter, body Body, actorID string) (any, error) {
		return c.opsRefund(path(e, "id"), body, actorID)
	}, true))
	router.GET("/ops/commerce/offers", finance(func(_ *core.RequestEvent, c *orderCenter, _ Body, _ string) (any, error) {
		return c.offers()
	}, false))
	router.POST("/ops/commerce/offers", finance(func(_ *core.RequestEvent, c *orderCenter, body Body, actorID string) (any, error) {
		return c.saveOffer(body, actorID)
	}, true))
	router.POST("/ops/commerce/offers/{id}/status", finance(func(e *core.RequestEvent, c *orderCenter, body Body, actorID string) (any, error) {
		return c.transitionOffer(path(e, "id"), body, actorID)
	}, true))

	// Once the platform disables payment for a tenant nobody will refund online,
	// so the studio settles what is still owed offline.
	tenancy.OnPluginDisabled(se.App, tenancy.Payment, settleRefundsOffline)
}

// StudentOf is the signed-in student for student order and payment routes.
func StudentOf(e *core.RequestEvent) (string, error) {
	user := auth.User(e)
	id := auth.ClaimString(user, "id")
	if id == "" || user["role"] != "student" {
		return "", Fail("STUDENT_LEARNING_STUDENT_REQUIRED", "仅学员可以购买课程", nil)
	}
	return id, nil
}

// FinanceActor is the operator holding the finance capability.
func FinanceActor(e *core.RequestEvent) (string, error) {
	user := auth.User(e)
	if err := RequireCapability(user, Finance); err != nil {
		return "", err
	}
	return auth.ClaimString(user, "id"), nil
}
