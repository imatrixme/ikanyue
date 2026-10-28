package coursecredit

import (
	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/auth"
)

// RenewalsModule serves renewal reminders: the ops list and sends, the teachers'
// read-only list, the students' 教务提醒, and the daily scan.
type RenewalsModule struct {
	Signer *auth.Signer
	Wechat *RenewalWechat
}

func (m RenewalsModule) Register(se *core.ServeEvent) {
	router := se.Router
	router.GET("/ops/course-credits/renewals", m.Signer.RequireOps(false, func(e *core.RequestEvent) error {
		return Query(e, func() (any, error) {
			if err := RequireCapability(auth.User(e), Finance); err != nil {
				return nil, err
			}
			return opsRenewals(e.App, clock())
		})
	}))
	router.POST("/ops/course-operations/renewal-reminders", m.Signer.RequireOps(false, func(e *core.RequestEvent) error {
		return Command(e, "sendRenewalReminders", func() (map[string]any, error) {
			body, err := financeBody(e)
			if err != nil {
				return nil, err
			}
			return sendRenewalReminders(e.App, m.Wechat, body, actorOf(e), clock())
		})
	}))
	router.GET("/v1/teacher/renewals", m.Signer.RequireSession(func(e *core.RequestEvent) error {
		return Query(e, func() (any, error) {
			teacherID, err := requireBookingTeacher(auth.User(e))
			if err != nil {
				return nil, err
			}
			return teacherRenewals(e.App, teacherID, clock())
		})
	}))

	student := func(e *core.RequestEvent) (string, error) {
		user := auth.User(e)
		studentID := auth.ClaimString(user, "id")
		if studentID == "" || user["role"] != "student" {
			return "", Fail("STUDENT_LEARNING_STUDENT_REQUIRED", "仅学员可以查看课程信息", nil)
		}
		return studentID, nil
	}
	router.GET("/v1/student/renewal-reminders", m.Signer.RequireSession(func(e *core.RequestEvent) error {
		return Query(e, func() (any, error) {
			studentID, err := student(e)
			if err != nil {
				return nil, err
			}
			return studentRenewalReminders(e.App, m.Wechat, studentID)
		})
	}))
	router.POST("/v1/student/renewal-reminders/read", m.Signer.RequireSession(func(e *core.RequestEvent) error {
		return Command(e, "readRenewalReminders", func() (map[string]any, error) {
			studentID, err := student(e)
			if err != nil {
				return nil, err
			}
			return readRenewalReminders(e.App, studentID, clock())
		})
	}))
	router.POST("/v1/student/renewal-reminders/subscriptions", m.Signer.RequireSession(func(e *core.RequestEvent) error {
		return Command(e, "subscribeRenewalReminders", func() (map[string]any, error) {
			studentID, err := student(e)
			if err != nil {
				return nil, err
			}
			return subscribeRenewals(e.App, studentID, auth.ClaimString(auth.User(e), "wechatOpenId"))
		})
	}))

	app := se.App
	app.Cron().MustAdd("renewalReminders", renewalSchedule, func() {
		created, err := scanRenewals(app, m.Wechat, clock())
		if err != nil {
			app.Logger().Error("renewal reminder scan failed", "error", err.Error())
			return
		}
		app.Logger().Info("renewal reminder scan finished", "created", created)
	})
}
