package coursecredit

import (
	"database/sql"
	"errors"
	"slices"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/httpx"
	"kanyue.server/internal/ids"
	"kanyue.server/internal/jsx"
	"kanyue.server/internal/records"
	"kanyue.server/internal/students"
)

// WorkbenchModule serves the mini program teacher workbench (/v1/workbench/*):
// one page whose sections follow the signed-in teacher's permissions, so a solo
// owner (an administrator teacher) and a hired teacher share it. Teaching routes
// use the session's capabilities; management routes re-read the teacher first.
type WorkbenchModule struct {
	Signer            *auth.Signer
	SettlementEnabled bool
}

func (m WorkbenchModule) requireSettlement() error {
	return SessionsModule{SettlementEnabled: m.SettlementEnabled}.requireSettlement()
}

// pendingLessonLimit bounds the waiting list; older unconfirmed lessons stay in the web admin.
const pendingLessonLimit = 100

func (m WorkbenchModule) Register(se *core.ServeEvent) {
	router := se.Router
	session := m.Signer.RequireSession
	path := func(e *core.RequestEvent, name string) string { return e.Request.PathValue(name) }

	// teaching runs with the session's snapshot, like the rest of the teacher workbench.
	teaching := func(e *core.RequestEvent) (string, error) {
		id, err := workbenchTeacher(auth.User(e))
		if err != nil {
			return "", err
		}
		return id, RequireAnyCapability(auth.User(e), Academic, Teacher)
	}
	// managing refreshes the session from the stored teacher before the route's check.
	managing := func(e *core.RequestEvent, check func(auth.Claims) error) error {
		user, err := refreshTeacher(e)
		if err != nil {
			return err
		}
		return check(user)
	}
	administrator := func(user auth.Claims) error {
		if user["isAdmin"] != true {
			return Fail("COURSE_CREDIT_ADMIN_REQUIRED", "需要管理员权限", nil)
		}
		return nil
	}
	finance := func(user auth.Claims) error { return RequireCapability(user, Finance) }
	settlement := func(user auth.Claims) error {
		if err := m.requireSettlement(); err != nil {
			return err
		}
		return RequireCapability(user, Settlement)
	}
	manageQuery := func(check func(auth.Claims) error, fn func(e *core.RequestEvent) (any, error)) func(*core.RequestEvent) error {
		return session(func(e *core.RequestEvent) error {
			return Query(e, func() (any, error) {
				if err := managing(e, check); err != nil {
					return nil, err
				}
				return fn(e)
			})
		})
	}
	// directory serves the students package, whose failures are plain coded errors.
	directory := func(fn func(e *core.RequestEvent) (any, error)) func(*core.RequestEvent) error {
		return session(func(e *core.RequestEvent) error {
			if err := managing(e, administrator); err != nil {
				return sendError(e, err)
			}
			return httpx.Respond(e, func() (any, error) { return fn(e) })
		})
	}

	router.GET("/v1/workbench/summary", session(func(e *core.RequestEvent) error {
		return Query(e, func() (any, error) {
			user, err := refreshTeacher(e)
			if err != nil {
				return nil, err
			}
			return workbenchSummary(e.App, user, m.SettlementEnabled, clock())
		})
	}))
	router.GET("/v1/workbench/lessons/pending", session(func(e *core.RequestEvent) error {
		return Query(e, func() (any, error) {
			teacherID, err := teaching(e)
			if err != nil {
				return nil, err
			}
			return pendingLessons(e.App, teacherID, explicitAcademic(auth.User(e)), clock())
		})
	}))
	router.POST("/v1/workbench/lessons/{sessionId}/confirm", session(func(e *core.RequestEvent) error {
		return Command(e, "confirmLesson", func() (map[string]any, error) {
			if err := m.requireSettlement(); err != nil {
				return nil, err
			}
			if _, err := teaching(e); err != nil {
				return nil, err
			}
			body, err := readOptionalJSONBody(e)
			if err != nil {
				return nil, err
			}
			route := map[string]any{"sessionId": path(e, "sessionId"), "actorTeachingScope": "assigned"}
			if explicitAcademic(auth.User(e)) {
				route["actorTeachingScope"] = "global"
			}
			return confirmLesson(e.App, bookingInput(body, actorOf(e), route))
		})
	}))
	router.POST("/v1/workbench/lessons/{sessionId}/reverse", session(func(e *core.RequestEvent) error {
		return Command(e, "reverseSessionSettlement", func() (map[string]any, error) {
			if err := managing(e, settlement); err != nil {
				return nil, err
			}
			body, err := ReadJSONBody(e)
			if err != nil {
				return nil, err
			}
			return reverseSessionSettlement(e.App, bookingInput(Body{Values: map[string]any{}}, actorOf(e),
				map[string]any{"reason": body.Get("reason"), "sessionId": path(e, "sessionId")}))
		})
	}))

	router.GET("/v1/workbench/students", directory(students.List))
	router.POST("/v1/workbench/students", directory(func(e *core.RequestEvent) (any, error) {
		body := httpx.ReadBody(e)
		if _, ok := textValue(body["password"]); !ok {
			// Students sign in with WeChat; the password only satisfies the directory rule.
			body["password"] = ids.UUID()
		}
		return students.Create(e, body)
	}))
	router.GET("/v1/workbench/students/{studentId}/ledger", manageQuery(administrator, func(e *core.RequestEvent) (any, error) {
		return studentLedger(e.App, path(e, "studentId"), clock())
	}))
	router.GET("/v1/workbench/packages", manageQuery(finance, func(e *core.RequestEvent) (any, error) {
		return sellablePackages(e.App, clock())
	}))
	router.POST("/v1/workbench/students/{studentId}/grants", session(func(e *core.RequestEvent) error {
		return Command(e, "automaticEnrollment", func() (map[string]any, error) {
			if err := managing(e, finance); err != nil {
				return nil, err
			}
			body, err := ReadJSONBody(e)
			if err != nil {
				return nil, err
			}
			values := map[string]any{"studentId": path(e, "studentId"), "channel": "offline",
				"packageId": body.Get("packageId"), "priceVersionId": body.Get("priceVersionId")}
			keys := []string{"channel", "packageId", "priceVersionId", "studentId"}
			if slices.Contains(body.Keys, "paidAmount") {
				values["paidAmount"] = body.Get("paidAmount")
				keys = append(keys, "paidAmount")
			}
			return enroll(e.App, Body{Values: values, Keys: keys}, actorOf(e), clock())
		})
	}))

	router.GET("/v1/workbench/teachers", manageQuery(administrator, func(e *core.RequestEvent) (any, error) {
		return workbenchTeachers(e.App)
	}))
	router.GET("/v1/workbench/teachers/{teacherId}/lessons", manageQuery(administrator, func(e *core.RequestEvent) (any, error) {
		return teacherLessons(e.App, path(e, "teacherId"), clock())
	}))
	router.POST("/v1/workbench/lessons/{sessionId}/substitute", session(func(e *core.RequestEvent) error {
		return Command(e, "substituteTeacher", func() (map[string]any, error) {
			if err := managing(e, administrator); err != nil {
				return nil, err
			}
			body, err := ReadJSONBody(e)
			if err != nil {
				return nil, err
			}
			return substituteTeacher(e.App, bookingInput(Body{Values: map[string]any{}}, actorOf(e), map[string]any{
				"sessionId": path(e, "sessionId"), "teacherId": body.Get("teacherId"), "reason": body.Get("reason")}))
		})
	}))
	router.GET("/v1/workbench/teachers/{teacherId}/handover", manageQuery(administrator, func(e *core.RequestEvent) (any, error) {
		return handoverPreview(e.App, map[string]any{"teacherId": path(e, "teacherId"),
			"toTeacherId": e.Request.URL.Query().Get("toTeacherId"), "actorId": actorOf(e).ID}, clock())
	}))
	router.POST("/v1/workbench/teachers/{teacherId}/handover", session(func(e *core.RequestEvent) error {
		return Command(e, "handoverTeacher", func() (map[string]any, error) {
			if err := managing(e, administrator); err != nil {
				return nil, err
			}
			body, err := ReadJSONBody(e)
			if err != nil {
				return nil, err
			}
			return handoverTeacher(e.App, bookingInput(Body{Values: map[string]any{}}, actorOf(e), map[string]any{
				"teacherId": path(e, "teacherId"), "toTeacherId": body.Get("toTeacherId"), "reason": body.Get("reason")}))
		})
	}))
}

func workbenchTeacher(user auth.Claims) (string, error) {
	id := auth.ClaimString(user, "id")
	if user["role"] != "teacher" || id == "" {
		return "", Fail("COURSE_CREDIT_CAPABILITY_REQUIRED", "仅教师可以使用工作台", map[string]any{"capability": Teacher})
	}
	return id, nil
}

// refreshTeacher replaces the session's permission snapshot with the stored
// teacher's, so a removed permission or a deactivated teacher applies at once.
func refreshTeacher(e *core.RequestEvent) (auth.Claims, error) {
	user := auth.User(e)
	id, err := workbenchTeacher(user)
	if err != nil {
		return nil, err
	}
	record, err := e.App.FindRecordById("teachers", id)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, err
	}
	if record == nil || record.GetBool("blocked") || !record.GetBool("verified") {
		return nil, Fail("COURSE_CREDIT_CAPABILITY_REQUIRED", "教师账号已停用", nil)
	}
	user["isAdmin"] = record.GetBool("idAdmin")
	user["courseCreditCapabilities"] = records.RawArray(record, "courseCreditCapabilities")
	return user, nil
}

// confirmLesson is the workbench "确认上课": attendance (everyone present unless
// listed absent), completion and settlement in one transaction. Settling is part
// of teaching here, so it needs no settlement capability. Each step keeps its own
// operation and audit under a key derived from the request's idempotency key, and
// a repeated request replays the settlement result.
func confirmLesson(app core.App, input map[string]any) (map[string]any, error) {
	if err := requiredID(input, "sessionId", "SESSION_ID_REQUIRED", "编号不能为空"); err != nil {
		return nil, err
	}
	key, ok := textValue(input["idempotencyKey"])
	if !ok {
		return nil, Fail("IDEMPOTENCY_KEY_REQUIRED", "idempotencyKey is required", nil)
	}
	key = strings.TrimSpace(key)
	absent, err := absentStudents(input["absentSessionStudentIds"])
	if err != nil {
		return nil, err
	}
	sessionID := text(input, "sessionId")
	stepInput := func(name string, values map[string]any) map[string]any {
		next := copyMap(input)
		delete(next, "absentSessionStudentIds")
		next["idempotencyKey"] = key + ":" + name
		for field, value := range values {
			next[field] = value
		}
		return next
	}
	settleInput := stepInput("settle", nil)
	if done, err := replay(app, "settleSession:"+key+":settle", fingerprint(map[string]any{"sessionId": sessionID}), replayConflict); done != nil || err != nil {
		return done, err
	}
	session, err := get(app, "sessions", sessionID)
	if err != nil {
		return nil, err
	}
	if err := authorizeSessionActor(app, input, sessionID); err != nil {
		return nil, err
	}
	if session["status"] == "settled" {
		return nil, Fail("SESSION_ALREADY_SETTLED", "这节课已经确认过了", nil)
	}
	var result map[string]any
	err = app.RunInTransaction(func(tx core.App) error {
		if _, err := markAllPresent(tx, stepInput("attendance", nil)); err != nil {
			return err
		}
		for _, id := range absent {
			if _, err := setAttendance(tx, stepInput("absent:"+id, map[string]any{"sessionStudentId": id, "attendanceStatus": "absent"})); err != nil {
				return err
			}
		}
		// Confirming a lesson also confirms who taught it: the actor's own planned row, or every
		// planned row when the owner confirms on a teacher's behalf.
		planned := `sessionId="` + escape(sessionID) + `" && actualStatus="planned"`
		if isAssignedTeachingActor(input) {
			planned += ` && teacherId="` + escape(text(input, "actorId")) + `"`
		}
		teachers, err := list(tx, "session_teachers", planned, "role,id")
		if err != nil {
			return err
		}
		for _, teacher := range teachers {
			id := jsx.String(teacher["id"])
			if _, err := setActualTeacher(tx, stepInput("teacher:"+id, map[string]any{"sessionTeacherId": id, "actualStatus": "confirmed"})); err != nil {
				return err
			}
		}
		if session["status"] != "completed" && session["status"] != "correction_pending" {
			current, err := get(tx, "sessions", sessionID)
			if err != nil {
				return err
			}
			actor := Actor{ID: text(input, "actorId"), Role: text(input, "actorRole"), IdempotencyKey: key + ":complete", TraceID: text(input, "traceId")}
			if _, err := updateLesson(tx, sessionID, current, map[string]any{"status": "completed"}, actor, "确认上课"); err != nil {
				return err
			}
		}
		settled, err := settleSession(tx, settleInput)
		if err != nil {
			return err
		}
		result = settled
		return send(tx, []step{lessonAudit(input, sessionID, "confirm", map[string]any{
			"absentCount": len(absent), "settlementOperationId": settled["operationId"]})})
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

func absentStudents(value any) ([]string, error) {
	if value == nil {
		return nil, nil
	}
	if _, undefined := value.(jsx.Undefined); undefined {
		return nil, nil
	}
	raw, ok := value.([]any)
	if !ok {
		return nil, Fail("ATTENDANCE_STATUS_INVALID", "缺席名单无效", nil)
	}
	result := []string{}
	for _, item := range raw {
		id, ok := textValue(item)
		if !ok {
			return nil, Fail("ATTENDANCE_STATUS_INVALID", "缺席名单无效", nil)
		}
		if !slices.Contains(result, id) {
			result = append(result, id)
		}
	}
	return result, nil
}

// waitingSessions are started lessons not yet settled, oldest first; an assigned
// teacher only sees lessons they teach.
func waitingSessions(app core.App, teacherID string, global bool, now time.Time) ([]map[string]any, error) {
	sessions, err := list(app, "sessions", `(status="scheduled" || status="enrollment_closed" || status="in_progress" || `+
		`status="completed" || status="correction_pending") && originType!="migration" && startAt<="`+filterTime(now)+`"`,
		"startAt", "requiredCreditTypeId")
	if err != nil || global {
		return limited(sessions), err
	}
	mine := []map[string]any{}
	for _, item := range sessions {
		assignment, err := findFirst(app, "session_teachers", `sessionId="`+escape(jsx.String(item["id"]))+`" && teacherId="`+
			escape(teacherID)+`" && actualStatus!="cancelled"`)
		if err != nil {
			return nil, err
		}
		if assignment != nil {
			mine = append(mine, item)
		}
	}
	return limited(mine), nil
}

func limited(items []map[string]any) []map[string]any {
	if len(items) > pendingLessonLimit {
		return items[:pendingLessonLimit]
	}
	return items
}

func pendingLessons(app core.App, teacherID string, global bool, now time.Time) (map[string]any, error) {
	sessions, err := waitingSessions(app, teacherID, global, now)
	if err != nil {
		return nil, err
	}
	items, err := lessonItems(app, sessions, now)
	if err != nil {
		return nil, err
	}
	return map[string]any{"items": items}, nil
}

// lessonItems shapes sessions for the workbench: time, students and the teachers still on them.
func lessonItems(app core.App, sessions []map[string]any, now time.Time) ([]any, error) {
	items := make([]any, 0, len(sessions))
	for _, item := range sessions {
		filter := `sessionId="` + escape(jsx.String(item["id"])) + `"`
		roster, err := list(app, "session_students", filter+` && attendanceStatus!="cancelled"`, "created", "studentId")
		if err != nil {
			return nil, err
		}
		teachers, err := list(app, "session_teachers", filter+` && actualStatus!="cancelled"`, "role", "teacherId")
		if err != nil {
			return nil, err
		}
		learners := make([]any, len(roster))
		for i, row := range roster {
			learners[i] = map[string]any{"sessionStudentId": row["id"], "name": personName(expanded(row, "studentId"), "学员"),
				"attendanceStatus": lookup(attendanceResults, row["attendanceStatus"], "pending")}
		}
		names, leadTeacherID := []any{}, ""
		for _, row := range teachers {
			names = append(names, personName(expanded(row, "teacherId"), "教师"))
			if row["role"] == "lead" && leadTeacherID == "" {
				leadTeacherID = relationID(row["teacherId"])
			}
		}
		creditType := expanded(item, "requiredCreditTypeId")
		start, _ := millis(item["startAt"])
		items = append(items, map[string]any{
			"sessionId": item["id"], "title": or(item["title"], or(creditType["name"], "课程")),
			"startAt": item["startAt"], "endAt": item["endAt"], "location": or(item["location"], ""),
			"reconfirm": item["status"] == "correction_pending", "started": start <= now.UnixMilli(),
			"teachers": names, "leadTeacherId": leadTeacherID, "students": learners,
		})
	}
	return items, nil
}

func workbenchSummary(app core.App, user auth.Claims, settlementEnabled bool, now time.Time) (map[string]any, error) {
	teacherID := auth.ClaimString(user, "id")
	teaches := HasCapability(user, Teacher)
	teachers, err := app.FindRecordsByFilter("teachers", "blocked=false && verified=true", "", 0, 0)
	if err != nil {
		return nil, err
	}
	waiting, requests := 0, 0.0
	if teaches {
		sessions, err := waitingSessions(app, teacherID, explicitAcademic(user), now)
		if err != nil {
			return nil, err
		}
		pending, err := listTeacherAppointments(app, teacherID, pageQuery("pending", 1))
		if err != nil {
			return nil, err
		}
		waiting, requests = len(sessions), jsx.Number(pending["totalItems"])
	}
	return map[string]any{
		"permissions": map[string]any{
			"teach":          teaches,
			"manageStudents": user["isAdmin"] == true,
			"grant":          HasCapability(user, Finance),
			"undo":           settlementEnabled && HasCapability(user, Settlement),
			"allLessons":     teaches && explicitAcademic(user),
		},
		"teacherCount": len(teachers), "pendingLessonCount": waiting, "pendingRequestCount": requests,
	}, nil
}

// studentLedger is the owner's view of one student: name, lessons by course,
// recent confirmed lessons (undo targets) and lesson records, in lesson language.
func studentLedger(app core.App, studentID string, now time.Time) (map[string]any, error) {
	student, err := get(app, "students", studentID)
	if err != nil {
		return nil, err
	}
	view := learning{app: app, now: now}
	overview, err := view.overview(studentID)
	if err != nil {
		return nil, err
	}
	history, err := view.records(studentID, map[string]string{"page": "1", "perPage": "50"})
	if err != nil {
		return nil, err
	}
	confirmed, err := pageOf(app, "session_students", `studentId="`+escape(studentID)+`" && sessionId.status="settled"`,
		"-sessionId.startAt", 1, 20, lessonExpand...)
	if err != nil {
		return nil, err
	}
	contexts, err := loadLessonContexts(app, confirmed.Items)
	if err != nil {
		return nil, err
	}
	lessons := make([]any, len(confirmed.Items))
	for i, row := range confirmed.Items {
		lessons[i] = mapLesson(row, contexts[sessionIDOf(row)])
	}
	return map[string]any{
		"student":          map[string]any{"studentId": student["id"], "name": personName(student, "学员"), "cellphone": or(student["cellphone"], "")},
		"overview":         overview,
		"confirmedLessons": lessons,
		"records":          history,
	}, nil
}

// sellablePackages lists active packages with the price versions enrollment
// accepts now and what each grants; packages missing either are left out.
func sellablePackages(app core.App, now time.Time) (map[string]any, error) {
	packages, err := list(app, "packages", `status="active"`, "name")
	if err != nil {
		return nil, err
	}
	prices, err := list(app, "price_versions", `status="active"`, "-validFrom,-version")
	if err != nil {
		return nil, err
	}
	lines, err := list(app, "package_grant_lines", "", "creditTypeId", "creditTypeId")
	if err != nil {
		return nil, err
	}
	items := []any{}
	for _, item := range packages {
		packageID := jsx.String(item["id"])
		versions := []any{}
		for _, price := range prices {
			if validateEnrollmentResources(item, price, packageID, now) != nil {
				continue
			}
			versions = append(versions, map[string]any{"priceVersionId": price["id"], "currency": or(price["currency"], "CNY"),
				"listAmount": price["listAmount"], "saleAmount": price["saleAmount"]})
		}
		grants := []any{}
		for _, line := range lines {
			if relationID(line["packageId"]) != packageID {
				continue
			}
			creditType := expanded(line, "creditTypeId")
			grants = append(grants, map[string]any{"name": or(creditType["name"], "课时"), "quantity": line["quantity"],
				"unitLabel": or(creditType["unitLabel"], "课时")})
		}
		if len(versions) == 0 || len(grants) == 0 {
			continue
		}
		items = append(items, map[string]any{"packageId": packageID, "name": item["name"],
			"validityDurationDays": or(item["validityDurationDays"], nil), "grants": grants, "prices": versions})
	}
	return map[string]any{"items": items}, nil
}
