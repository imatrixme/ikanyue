package coursecredit

import (
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/ids"
	"kanyue.server/internal/jsx"
)

// LedgerModule serves the course-credit ledger: order grants, enrollment and
// roster sync, batch extend/restore, expiry and reconciliation, the ops
// ledger reads, metrics and the student learning views. It also schedules
// expiry, daily reconciliation and outbox delivery, which Hono left to manual
// runs or an external worker.
type LedgerModule struct {
	Signer        *auth.Signer
	GrantsEnabled bool
	// Dispatcher sends outbox events; nil leaves them queued and the delivery route refuses.
	Dispatcher Dispatcher
}

// ledgerReads maps ops query routes to resources and the capability they need.
var ledgerReads = []struct{ path, resource, capability string }{
	{"/ops/course-credits/orders", "orders", Finance},
	{"/ops/course-credits/enrollments", "enrollments", Finance},
	{"/ops/course-credits/reconciliation/runs", "reconciliationRuns", Audit},
	{"/ops/course-credits/reconciliation/exceptions", "reconciliationExceptions", Audit},
	{"/ops/course-credits/audit-logs", "auditLogs", Audit},
}

const (
	expirySchedule         = "*/5 * * * *"
	reconciliationSchedule = "0 19 * * *" // 03:00 Asia/Shanghai; cron runs in UTC
	reconciliationWindow   = 25 * time.Hour
)

func (m LedgerModule) Register(se *core.ServeEvent) {
	ops := func(handler func(*core.RequestEvent) error) func(*core.RequestEvent) error {
		return m.Signer.RequireOps(false, handler)
	}
	query := func(capability string, fn func(e *core.RequestEvent) (any, error)) func(*core.RequestEvent) error {
		return ops(func(e *core.RequestEvent) error {
			return Query(e, func() (any, error) {
				if err := RequireCapability(auth.User(e), capability); err != nil {
					return nil, err
				}
				return fn(e)
			})
		})
	}
	command := func(name string, fn func(e *core.RequestEvent) (map[string]any, error)) func(*core.RequestEvent) error {
		return ops(func(e *core.RequestEvent) error {
			return Command(e, name, func() (map[string]any, error) { return fn(e) })
		})
	}
	router := se.Router

	for _, route := range ledgerReads {
		name := route.resource
		router.GET(route.path, query(route.capability, func(e *core.RequestEvent) (any, error) {
			return listResource(e.App, name, queryParams(e, listQueryNames...))
		}))
		router.GET(route.path+"/{id}", query(route.capability, func(e *core.RequestEvent) (any, error) {
			return getResource(e.App, name, e.Request.PathValue("id"))
		}))
	}
	router.GET("/ops/course-credits/accounts", query(Finance, func(e *core.RequestEvent) (any, error) {
		return listAccounts(e.App, queryParams(e, "page", "perPage", "studentIds", "renewalThreshold"))
	}))
	router.GET("/ops/course-credits/accounts/{studentId}", query(Finance, func(e *core.RequestEvent) (any, error) {
		return getAccount(e.App, e.Request.PathValue("studentId"))
	}))
	router.GET("/ops/course-credits/student-overview", query(Finance, func(e *core.RequestEvent) (any, error) {
		return studentOverview(e.App, queryParams(e, "studentIds"), clock())
	}))
	router.GET("/ops/course-credits/settlement-exceptions", query(Settlement, func(e *core.RequestEvent) (any, error) {
		return listSettlementExceptions(e.App, queryParams(e, "page", "perPage", "kind", "status", "sessionId", "studentId"))
	}))
	router.GET("/ops/course-credits/settlement-exceptions/{id}", query(Settlement, func(e *core.RequestEvent) (any, error) {
		return getResource(e.App, "settlementExceptions", e.Request.PathValue("id"))
	}))

	router.POST("/ops/course-credits/orders/{orderId}/grant", command("grantOrderCredits", func(e *core.RequestEvent) (map[string]any, error) {
		if !m.GrantsEnabled {
			return nil, Fail("COURSE_CREDIT_FEATURE_DISABLED", "课程点发放尚未开放", map[string]any{"feature": "grants"})
		}
		if err := RequireCapability(auth.User(e), Finance); err != nil {
			return nil, err
		}
		return grantOrderCredits(e.App, e.Request.PathValue("orderId"), actorOf(e), clock())
	}))
	for _, batch := range []struct {
		path, name string
		run        func(core.App, batchCommand, int) (map[string]any, error)
	}{
		{"extend", "extendBatchExpiry", extendBatchExpiry},
		{"restore-expired", "restoreExpiredQuantity", restoreExpiredQuantity},
	} {
		run := batch.run
		router.POST("/ops/course-credits/batches/{batchId}/"+batch.path, command(batch.name, func(e *core.RequestEvent) (map[string]any, error) {
			if err := RequireCapability(auth.User(e), Settlement); err != nil {
				return nil, err
			}
			body, err := readJSONBody(e)
			if err != nil {
				return nil, err
			}
			return run(e.App, batchCommand{BatchID: e.Request.PathValue("batchId"), Body: body, Actor: actorOf(e), Clock: clock}, 0)
		}))
	}
	router.POST("/ops/course-credits/workers/expiry/run", command("expireBatches", func(e *core.RequestEvent) (map[string]any, error) {
		if err := RequireCapability(auth.User(e), Settlement); err != nil {
			return nil, err
		}
		body, err := readOptionalJSONBody(e)
		if err != nil {
			return nil, err
		}
		return expireDue(e.App, actorOf(e), body.Get("limit"), clock())
	}))
	router.POST("/ops/course-credits/reconciliation/runs", command("runReconciliation", func(e *core.RequestEvent) (map[string]any, error) {
		if err := RequireCapability(auth.User(e), Audit); err != nil {
			return nil, err
		}
		body, err := readJSONBody(e)
		if err != nil {
			return nil, err
		}
		return runReconciliation(e.App, body.Get("scope"), body.Get("since"), clock)
	}))
	outboxes := &outboxRunner{dispatcher: m.Dispatcher}
	router.POST("/ops/course-credits/workers/outbox/deliver", command("deliverOutbox", func(e *core.RequestEvent) (map[string]any, error) {
		if err := RequireCapability(auth.User(e), Audit); err != nil {
			return nil, err
		}
		body, err := readOptionalJSONBody(e)
		if err != nil {
			return nil, err
		}
		return outboxes.deliver(e.App, body.Get("limit"))
	}))
	router.GET("/ops/course-credits/outbox/dead-letters", query(Audit, func(e *core.RequestEvent) (any, error) {
		return newOutbox(e.App, m.Dispatcher).listDeadLetters(queryParams(e, "page", "perPage"))
	}))
	router.GET("/ops/course-credits/metrics", query(Audit, func(e *core.RequestEvent) (any, error) {
		return metricsSnapshot(e.App, defaultMetrics, clock())
	}))

	router.POST("/ops/course-operations/enrollments", command("automaticEnrollment", func(e *core.RequestEvent) (map[string]any, error) {
		body, err := readJSONBody(e)
		if err != nil {
			return nil, err
		}
		user := auth.User(e)
		if err := RequireCapability(user, Finance); err != nil {
			return nil, err
		}
		if jsx.Truthy(body.Get("classId")) {
			if err := RequireCapability(user, Academic); err != nil {
				return nil, err
			}
		}
		return enroll(e.App, body, actorOf(e), clock())
	}))
	router.GET("/ops/course-operations/enrollments/{orderId}/sync-preview", query(Academic, func(e *core.RequestEvent) (any, error) {
		return previewRosterSync(e.App, e.Request.PathValue("orderId"), clock())
	}))
	router.POST("/ops/course-operations/enrollments/{orderId}/sync", command("confirmEnrollmentRosterSync", func(e *core.RequestEvent) (map[string]any, error) {
		if err := RequireCapability(auth.User(e), Academic); err != nil {
			return nil, err
		}
		body, err := readJSONBody(e)
		if err != nil {
			return nil, err
		}
		return confirmRosterSync(e.App, e.Request.PathValue("orderId"), body, actorOf(e), clock())
	}))

	student := func(fn func(e *core.RequestEvent, view learning, studentID string) (any, error)) func(*core.RequestEvent) error {
		return m.Signer.RequireSession(func(e *core.RequestEvent) error {
			return Query(e, func() (any, error) {
				user := auth.User(e)
				studentID := auth.ClaimString(user, "id")
				if studentID == "" || user["role"] != "student" {
					return nil, Fail("STUDENT_LEARNING_STUDENT_REQUIRED", "仅学员可以查看课程信息", nil)
				}
				return fn(e, learning{app: e.App, now: clock()}, studentID)
			})
		})
	}
	router.GET("/v1/student/learning/overview", student(func(_ *core.RequestEvent, view learning, studentID string) (any, error) {
		return view.overview(studentID)
	}))
	router.GET("/v1/student/learning/courses/{courseId}", student(func(e *core.RequestEvent, view learning, studentID string) (any, error) {
		return view.course(studentID, e.Request.PathValue("courseId"))
	}))
	router.GET("/v1/student/learning/lessons", student(func(e *core.RequestEvent, view learning, studentID string) (any, error) {
		return view.lessons(studentID, queryParams(e, "page", "perPage", "scope", "courseId"))
	}))
	router.GET("/v1/student/learning/lessons/{lessonId}", student(func(e *core.RequestEvent, view learning, studentID string) (any, error) {
		return view.lesson(studentID, e.Request.PathValue("lessonId"))
	}))
	router.GET("/v1/student/learning/records", student(func(e *core.RequestEvent, view learning, studentID string) (any, error) {
		return view.records(studentID, queryParams(e, "page", "perPage", "courseId"))
	}))

	m.schedule(se.App, outboxes)
}

// schedule registers the in-process expiry, reconciliation and outbox jobs. They
// only exist while this module is owned by Go, so Hono never runs them twice.
func (m LedgerModule) schedule(app core.App, outboxes *outboxRunner) {
	if m.Dispatcher != nil {
		app.Cron().MustAdd("courseCreditOutbox", outboxSchedule, func() { outboxes.tick(app) })
	}
	app.Cron().MustAdd("courseCreditExpiry", expirySchedule, func() {
		actor := Actor{Role: "system", TraceID: "cron-expiry-" + ids.Record()}
		if _, err := expireDue(app, actor, jsx.Undefined{}, clock()); err != nil {
			app.Logger().Error("course-credit expiry run failed", "error", err.Error())
		}
	})
	app.Cron().MustAdd("courseCreditReconciliation", reconciliationSchedule, func() {
		since := iso(clock().Add(-reconciliationWindow))
		result, err := runReconciliation(app, "incremental", since, clock)
		if err != nil {
			app.Logger().Error("course-credit reconciliation failed", "error", err.Error())
			return
		}
		if result["status"] != "passed" {
			app.Logger().Warn("course-credit reconciliation found differences",
				"runId", result["runId"], "differenceCount", result["differenceCount"])
		}
	})
}

// readOptionalJSONBody is Hono's readOptionalJsonBody: only JSON requests are parsed.
func readOptionalJSONBody(e *core.RequestEvent) (Body, error) {
	if !strings.Contains(e.Request.Header.Get("Content-Type"), "application/json") {
		return Body{Values: map[string]any{}}, nil
	}
	return readJSONBody(e)
}
