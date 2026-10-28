// Package points serves student points and reward items: the mini program
// balance and reward catalog, and the ops points ledger and reward management.
// Rules and field shapes match Hono's PointService and RewardService; balance
// changes and their events commit in one transaction.
package points

import (
	"errors"
	"math"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/audit"
	"kanyue.server/internal/auth"
	"kanyue.server/internal/httpx"
	"kanyue.server/internal/jsx"
	"kanyue.server/internal/records"
)

const (
	pointEvents   = "point_events"
	studentPoints = "student_points"
	rewardItems   = "reward_items"
)

type Module struct {
	Signer *auth.Signer
	// PublicAssetBaseURL and PBPublicURL build reward image URLs (Hono's getFileUrl).
	PublicAssetBaseURL string
	PBPublicURL        string
}

func (m Module) Register(se *core.ServeEvent) {
	r := se.Router
	student := func(handler func(e *core.RequestEvent) (any, error)) func(*core.RequestEvent) error {
		return m.Signer.RequireSession(func(e *core.RequestEvent) error {
			return httpx.Respond(e, func() (any, error) {
				user := auth.User(e)
				if auth.ClaimString(user, "id") == "" || auth.ClaimString(user, "role") != "student" {
					return nil, userError(403, "仅学员可访问积分")
				}
				return handler(e)
			})
		})
	}
	ops := func(handler func(e *core.RequestEvent) (any, error)) func(*core.RequestEvent) error {
		return m.Signer.RequireOps(false, func(e *core.RequestEvent) error {
			return httpx.Respond(e, func() (any, error) { return handler(e) })
		})
	}

	r.GET("/v1/points/me", student(func(e *core.RequestEvent) (any, error) {
		query := e.Request.URL.Query()
		return summary(e.App, auth.ClaimString(auth.User(e), "id"), query.Get("page"), query.Get("perPage"))
	}))
	r.GET("/v1/reward-items", student(func(e *core.RequestEvent) (any, error) {
		account, err := summary(e.App, auth.ClaimString(auth.User(e), "id"), "", "5")
		if err != nil {
			return nil, err
		}
		return m.availability(e.App, account["balance"].(float64))
	}))

	r.GET("/ops/points/students", ops(func(e *core.RequestEvent) (any, error) { return listBalances(e) }))
	studentSummary := ops(func(e *core.RequestEvent) (any, error) {
		query := e.Request.URL.Query()
		return summary(e.App, e.Request.PathValue("studentId"), query.Get("page"), query.Get("perPage"))
	})
	r.GET("/ops/points/students/{studentId}", studentSummary)
	r.GET("/ops/points/students/{studentId}/events", studentSummary)
	r.POST("/ops/points/students/{studentId}/earn", ops(func(e *core.RequestEvent) (any, error) {
		return addPoints(e, httpx.ReadBody(e), e.Request.PathValue("studentId"))
	}))
	r.POST("/ops/points/offline-redeem", ops(func(e *core.RequestEvent) (any, error) {
		return m.offlineRedeem(e, httpx.ReadBody(e))
	}))

	r.GET("/ops/reward-items", ops(func(e *core.RequestEvent) (any, error) { return m.listRewards(e) }))
	r.POST("/ops/reward-items", ops(func(e *core.RequestEvent) (any, error) { return m.createReward(e, httpx.ReadBody(e)) }))
	r.POST("/ops/reward-items/{id}", ops(func(e *core.RequestEvent) (any, error) {
		return m.updateReward(e, e.Request.PathValue("id"), httpx.ReadBody(e))
	}))
	r.POST("/ops/reward-items/{id}/image", ops(func(e *core.RequestEvent) (any, error) {
		return m.uploadImage(e, e.Request.PathValue("id"))
	}))
}

// summary is PointService.getStudentSummary; it creates the account on first read.
func summary(app core.App, studentID, page, perPage string) (map[string]any, error) {
	id, err := requireID(studentID, "学员不能为空")
	if err != nil {
		return nil, err
	}
	account, err := ensureAccount(app, id)
	if err != nil {
		return nil, err
	}
	result, err := records.Page(app, pointEvents, `studentId = "`+records.EscapeFilter(id)+`"`, "-created",
		positivePage(page, 1), positivePage(perPage, 20))
	if err != nil {
		return nil, err
	}
	events := make([]map[string]any, 0, len(result.Items))
	for _, record := range result.Items {
		events = append(events, records.JSON(record))
	}
	return map[string]any{
		"balance":    number(account.Get("balance")),
		"events":     events,
		"pagination": pagination(result),
		"studentId":  id,
	}, nil
}

func listBalances(e *core.RequestEvent) (any, error) {
	query := e.Request.URL.Query()
	perPage := query.Get("perPage")
	if perPage == "" {
		perPage = query.Get("limit")
	}
	// `q || keyword`: a blank but non-empty q still wins.
	keyword := query.Get("q")
	if keyword == "" {
		keyword = query.Get("keyword")
	}
	keyword = strings.TrimSpace(keyword)
	filters := []string{}
	if keyword != "" {
		value := records.EscapeFilter(keyword)
		filters = append(filters, `(realName ~ "`+value+`" || nickName ~ "`+value+`" || cellphone ~ "`+value+`")`)
	}
	filters = append(filters, "blocked = false")
	result, err := records.Page(e.App, "students", strings.Join(filters, " && "), "-updated",
		positivePage(query.Get("page"), 1), positivePage(perPage, 20))
	if err != nil {
		return nil, err
	}
	items := make([]map[string]any, 0, len(result.Items))
	for _, student := range result.Items {
		account, err := findAccount(e.App, student.Id)
		if err != nil {
			return nil, err
		}
		balance := 0.0
		if account != nil {
			balance = number(account.Get("balance"))
		}
		items = append(items, map[string]any{
			"avatar":    strings.TrimSpace(student.GetString("avatar")),
			"balance":   balance,
			"cellphone": strings.TrimSpace(student.GetString("cellphone")),
			"id":        student.Id,
			"nickName":  strings.TrimSpace(student.GetString("nickName")),
			"realName":  strings.TrimSpace(student.GetString("realName")),
		})
	}
	return map[string]any{"items": items, "pagination": pagination(result)}, nil
}

func addPoints(e *core.RequestEvent, input httpx.Body, studentID string) (any, error) {
	if err := assertAdmin(e); err != nil {
		return nil, err
	}
	id, err := requireID(studentID, "学员不能为空")
	if err != nil {
		return nil, err
	}
	amount := jsx.Number(input["amount"])
	if !isPositiveInteger(amount) {
		return nil, userError(400, "积分必须为正整数")
	}
	// The event defaults a blank reason; the audit keeps what was sent, like Hono.
	reason := trimmed(input["reason"])
	eventReason := reason
	if eventReason == "" {
		eventReason = "admin_grant"
	}
	result, err := applyDelta(e, delta{studentID: id, amount: amount, reason: eventReason, remark: trimmed(input["remark"]), kind: "earn"})
	if err != nil {
		return nil, err
	}
	auditPoints(e, "ops.points.add", id, map[string]any{"amount": amount, "reason": reason})
	return result, nil
}

func (m Module) offlineRedeem(e *core.RequestEvent, input httpx.Body) (any, error) {
	if err := assertAdmin(e); err != nil {
		return nil, err
	}
	id, err := requireID(input["studentId"], "学员不能为空")
	if err != nil {
		return nil, err
	}
	reward, err := activeReward(e.App, input["itemId"])
	if err != nil {
		return nil, err
	}
	price := number(reward.Get("pointsPrice"))
	account, err := ensureAccount(e.App, id)
	if err != nil {
		return nil, err
	}
	if number(account.Get("balance")) < price {
		return nil, userError(400, "积分不足，无法兑换该实物")
	}
	result, err := applyDelta(e, delta{studentID: id, amount: -price, reason: "offline_redeem", remark: trimmed(input["remark"]),
		kind: "offline_redeem", rewardItemID: reward.Id,
		rewardSnapshot: map[string]any{"id": reward.Id, "name": reward.GetString("name"), "pointsPrice": price}})
	if err != nil {
		return nil, err
	}
	auditPoints(e, "ops.points.offline_redeem", id, map[string]any{"itemId": reward.Id, "pointsPrice": price})
	result["reward"] = records.JSON(reward)
	return result, nil
}

type delta struct {
	studentID, reason, remark, kind, rewardItemID string
	amount                                        float64
	rewardSnapshot                                map[string]any
}

// applyDelta moves the balance and writes its event atomically; the balance
// never goes negative.
func applyDelta(e *core.RequestEvent, change delta) (map[string]any, error) {
	user := auth.User(e)
	var result map[string]any
	err := e.App.RunInTransaction(func(txApp core.App) error {
		account, err := ensureAccount(txApp, change.studentID)
		if err != nil {
			return err
		}
		next := number(account.Get("balance")) + change.amount
		if next < 0 {
			return userError(400, "积分不足")
		}
		account.Set("balance", next)
		if err := txApp.Save(account); err != nil {
			return err
		}
		target, err := txApp.FindCollectionByNameOrId(pointEvents)
		if err != nil {
			return err
		}
		event := core.NewRecord(target)
		var snapshot any
		if change.rewardSnapshot != nil {
			snapshot = change.rewardSnapshot
		}
		event.Load(map[string]any{
			"balanceAfter":   next,
			"delta":          change.amount,
			"operatorId":     auth.ClaimString(user, "id"),
			"operatorRole":   auth.ClaimString(user, "role"),
			"reason":         change.reason,
			"remark":         change.remark,
			"rewardItemId":   change.rewardItemID,
			"rewardSnapshot": snapshot,
			"studentId":      change.studentID,
			"type":           change.kind,
		})
		if err := txApp.Save(event); err != nil {
			return err
		}
		result = map[string]any{"balance": next, "event": records.JSON(event), "studentId": change.studentID}
		return nil
	})
	return result, err
}

func ensureAccount(app core.App, studentID string) (*core.Record, error) {
	existing, err := findAccount(app, studentID)
	if err != nil || existing != nil {
		return existing, err
	}
	target, err := app.FindCollectionByNameOrId(studentPoints)
	if err != nil {
		return nil, err
	}
	account := core.NewRecord(target)
	account.Set("balance", 0)
	account.Set("studentId", studentID)
	if err := app.Save(account); err != nil {
		return nil, storeError(err)
	}
	return account, nil
}

func findAccount(app core.App, studentID string) (*core.Record, error) {
	account := &core.Record{}
	err := app.RecordQuery(studentPoints).AndWhere(dbx.HashExp{"studentId": studentID}).Limit(1).One(account)
	if isNoRows(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return account, nil
}

func auditPoints(e *core.RequestEvent, action, studentID string, metadata map[string]any) {
	user := auth.User(e)
	audit.Record(e.App, audit.Entry{
		Actor:        &audit.Actor{ID: auth.ClaimString(user, "id"), Role: auth.ClaimString(user, "role")},
		Action:       action,
		ResourceType: studentPoints,
		ResourceID:   studentID,
		Metadata:     metadata,
	})
}

func pagination(result records.PageResult) map[string]any {
	return map[string]any{"page": result.Page, "perPage": result.PerPage, "totalItems": result.TotalItems, "totalPages": result.TotalPages}
}

func assertAdmin(e *core.RequestEvent) error {
	user := auth.User(e)
	if auth.ClaimString(user, "id") == "" || !jsx.Truthy(user["isAdmin"]) {
		return userError(403, "需要管理员权限")
	}
	return nil
}

func requireID(value any, message string) (string, error) {
	id := trimmed(value)
	if id == "" {
		return "", userError(400, message)
	}
	return id, nil
}

// storeError keeps an invalid relation (unknown student) a 400 like PocketBase REST.
func storeError(err error) error {
	var coded *httpx.CodedError
	if errors.As(err, &coded) {
		return err
	}
	if strings.Contains(err.Error(), "studentId") {
		return userError(400, "Failed to create record.")
	}
	return err
}

func userError(code int, message string) error {
	return &httpx.CodedError{Code: code, Message: message}
}

func trimmed(value any) string {
	text, _ := value.(string)
	return strings.TrimSpace(text)
}

func number(value any) float64 {
	n := jsx.Number(value)
	if math.IsNaN(n) || math.IsInf(n, 0) {
		return 0
	}
	return n
}

func isPositiveInteger(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0) && value > 0 && value == math.Trunc(value)
}

// positivePage is Number(value) when finite and positive, floored; otherwise the fallback.
func positivePage(value string, fallback int) int {
	n := jsx.Number(value)
	if math.IsNaN(n) || math.IsInf(n, 0) || n <= 0 {
		return fallback
	}
	return int(math.Floor(n))
}

func isNoRows(err error) bool {
	return err != nil && strings.Contains(err.Error(), "no rows")
}
