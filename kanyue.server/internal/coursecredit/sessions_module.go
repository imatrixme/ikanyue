package coursecredit

import (
	"slices"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/jsx"
)

// SessionsModule serves classes and sessions: class rosters and teachers,
// session publication, reschedule and cancellation, attendance, settlement and
// its reversal, teacher workload confirmation, the ops course calendar, teacher
// calendars and upcoming lessons.
type SessionsModule struct {
	Signer            *auth.Signer
	SettlementEnabled bool
}

func (m SessionsModule) requireSettlement() error {
	if m.SettlementEnabled {
		return nil
	}
	return Fail("COURSE_CREDIT_FEATURE_DISABLED", "课程点结算尚未开放", map[string]any{"feature": "settlement"})
}

// explicitAcademic is Hono's `user.isAdmin || user.courseCreditCapabilities.includes(ACADEMIC)`,
// which decides between the global and the assigned-teacher view.
func explicitAcademic(user auth.Claims) bool {
	if user["isAdmin"] == true {
		return true
	}
	values, _ := user["courseCreditCapabilities"].([]any)
	return slices.Contains(values, any(Academic))
}

// sessionReads maps query routes to resources and the capabilities that may read them.
var sessionReads = []struct {
	path, resource string
	capabilities   []string
}{
	{"/ops/course-credits/classes", "classes", []string{Academic}},
	{"/ops/course-credits/class-students", "classStudents", []string{Academic}},
	{"/ops/course-credits/class-teachers", "classTeachers", []string{Academic}},
	{"/ops/course-credits/sessions", "sessions", []string{Academic, Settlement}},
	{"/ops/course-credits/session-classes", "sessionClasses", []string{Academic}},
	{"/ops/course-credits/session-students", "sessionStudents", []string{Academic, Settlement}},
	{"/ops/course-credits/session-teachers", "sessionTeachers", []string{Academic, Settlement}},
}

// sessionQueryNames are listAny's query parameters; single-capability reads use listQueryNames.
var sessionQueryNames = []string{
	"page", "perPage", "status", "studentId", "teacherId", "classId", "sessionId",
	"attendanceStatus", "creditStatus", "actualStatus", "from", "to",
}

func (m SessionsModule) Register(se *core.ServeEvent) {
	router := se.Router
	ops := func(handler func(*core.RequestEvent) error) func(*core.RequestEvent) error {
		return m.Signer.RequireOps(false, handler)
	}
	path := func(e *core.RequestEvent, name string) string { return e.Request.PathValue(name) }
	// command runs a checked ops command over Hono's commandMetadata and named fields.
	command := func(name string, check func(auth.Claims) error, optional bool, input func(e *core.RequestEvent, body Body, actor Actor) map[string]any,
		run func(core.App, map[string]any) (map[string]any, error)) func(*core.RequestEvent) error {
		return ops(func(e *core.RequestEvent) error {
			return Command(e, name, func() (map[string]any, error) {
				if err := check(auth.User(e)); err != nil {
					return nil, err
				}
				read := readJSONBody
				if optional {
					read = readOptionalJSONBody
				}
				body, err := read(e)
				if err != nil {
					return nil, err
				}
				return run(e.App, input(e, body, actorOf(e)))
			})
		})
	}
	academic := func(user auth.Claims) error { return RequireCapability(user, Academic) }
	settlement := func(user auth.Claims) error {
		if err := m.requireSettlement(); err != nil {
			return err
		}
		return RequireCapability(user, Settlement)
	}
	teaching := func(user auth.Claims) error { return RequireAnyCapability(user, Academic, Teacher) }
	fields := func(actor Actor, values map[string]any) map[string]any {
		input := bookingInput(Body{Values: map[string]any{}}, actor, nil)
		for key, value := range values {
			input[key] = value
		}
		return input
	}
	// lessonInput is `{...body, ...commandMetadata, actorTeachingScope, ...route}`.
	lessonInput := func(params ...string) func(e *core.RequestEvent, body Body, actor Actor) map[string]any {
		return func(e *core.RequestEvent, body Body, actor Actor) map[string]any {
			route := map[string]any{"actorTeachingScope": "assigned"}
			if explicitAcademic(auth.User(e)) {
				route["actorTeachingScope"] = "global"
			}
			for _, name := range params {
				route[name] = path(e, name)
			}
			return bookingInput(body, actor, route)
		}
	}

	router.POST("/ops/course-credits/classes/{classId}/students/{studentId}/membership", command("setStudentMembership", academic, false,
		func(e *core.RequestEvent, body Body, actor Actor) map[string]any {
			return fields(actor, map[string]any{"classId": path(e, "classId"), "studentId": path(e, "studentId"),
				"status": body.Get("status"), "effectiveFrom": body.Get("effectiveFrom"), "effectiveTo": body.Get("effectiveTo"),
				"sourceOrderId": body.Get("sourceOrderId")})
		}, setStudentMembership))
	router.POST("/ops/course-credits/classes/{classId}/students/{studentId}/transfer", command("transferStudent", academic, false,
		func(e *core.RequestEvent, body Body, actor Actor) map[string]any {
			return fields(actor, map[string]any{"fromClassId": path(e, "classId"), "toClassId": body.Get("toClassId"),
				"studentId": path(e, "studentId"), "effectiveAt": body.Get("effectiveAt"), "sourceOrderId": body.Get("sourceOrderId")})
		}, transferStudent))
	router.POST("/ops/course-credits/classes/{classId}/teachers/{teacherId}/assignment", command("setTeacherAssignment", academic, false,
		func(e *core.RequestEvent, body Body, actor Actor) map[string]any {
			return fields(actor, map[string]any{"classId": path(e, "classId"), "teacherId": path(e, "teacherId"),
				"role": body.Get("role"), "status": body.Get("status"), "effectiveFrom": body.Get("effectiveFrom"),
				"effectiveTo": body.Get("effectiveTo")})
		}, setTeacherAssignment))
	router.POST("/ops/course-credits/sessions/{sessionId}/publish", command("publishSession", academic, false,
		func(e *core.RequestEvent, body Body, actor Actor) map[string]any {
			return fields(actor, map[string]any{"sessionId": path(e, "sessionId"), "classIds": body.Get("classIds"),
				"teacherOverrides": body.Get("teacherOverrides")})
		}, publishSession))
	router.POST("/ops/course-credits/sessions/{sessionId}/reschedule", command("rescheduleSession", academic, false,
		func(e *core.RequestEvent, body Body, actor Actor) map[string]any {
			return fields(actor, map[string]any{"newEndAt": body.Get("newEndAt"), "newStartAt": body.Get("newStartAt"),
				"reason": body.Get("reason"), "sessionId": path(e, "sessionId")})
		}, rescheduleSession))
	settlementInput := func(e *core.RequestEvent, body Body, actor Actor) map[string]any {
		return fields(actor, map[string]any{"reason": body.Get("reason"), "sessionId": path(e, "sessionId")})
	}
	router.POST("/ops/course-credits/teacher-events/{teacherCreditEventId}/confirm", command("confirmTeacherCredit",
		func(user auth.Claims) error { return RequireCapability(user, Finance) }, false,
		func(e *core.RequestEvent, body Body, actor Actor) map[string]any {
			return fields(actor, map[string]any{"teacherCreditEventId": path(e, "teacherCreditEventId"), "reason": body.Get("reason")})
		}, confirmTeacherCredit))
	router.GET("/ops/course-credits/teacher-events", ops(func(e *core.RequestEvent) error {
		return Query(e, func() (any, error) {
			user := auth.User(e)
			if err := RequireCapability(user, Teacher); err != nil {
				return nil, err
			}
			query := queryParams(e, "page", "perPage", "status", "teacherId", "sessionTeacherId")
			if !jsx.Truthy(user["isAdmin"]) {
				query["teacherId"] = auth.ClaimString(user, "id")
			}
			return listTeacherEvents(e.App, query)
		})
	}))
	router.GET("/ops/course-credits/teacher-events/{id}", ops(func(e *core.RequestEvent) error {
		return Query(e, func() (any, error) {
			user := auth.User(e)
			if err := RequireCapability(user, Teacher); err != nil {
				return nil, err
			}
			return assignedTeacherEvent(e.App, user, path(e, "id"))
		})
	}))
	router.POST("/ops/course-credits/sessions/{sessionId}/settle", command("settleSession", settlement, true, settlementInput, settleSession))
	router.POST("/ops/course-credits/sessions/{sessionId}/reverse-settlement", command("reverseSessionSettlement", settlement, false, settlementInput, reverseSessionSettlement))
	router.POST("/ops/course-credits/sessions/{sessionId}/cancel", command("cancelSession", academic, true,
		func(e *core.RequestEvent, body Body, actor Actor) map[string]any {
			actor.Role = "admin"
			return bookingInput(body, actor, map[string]any{"sessionId": path(e, "sessionId")})
		}, cancelSession))

	base := "/ops/course-operations/lessons/{sessionId}"
	router.POST(base+"/students/{sessionStudentId}/attendance", command("setManualAttendance", teaching, false, lessonInput("sessionId", "sessionStudentId"), setAttendance))
	router.POST(base+"/attendance/all-present", command("markAllPresent", teaching, false, lessonInput("sessionId"), markAllPresent))
	router.POST(base+"/teachers/{sessionTeacherId}/actual-status", command("setActualTeacher", teaching, false, lessonInput("sessionId", "sessionTeacherId"), setActualTeacher))
	router.GET(base+"/settlement-preview", ops(func(e *core.RequestEvent) error {
		return Query(e, func() (any, error) {
			if err := RequireCapability(auth.User(e), Settlement); err != nil {
				return nil, err
			}
			return previewSettlement(e.App, path(e, "sessionId"))
		})
	}))

	for _, name := range []string{"classes", "lessons"} {
		resource := name
		academicBody := func(e *core.RequestEvent) (Body, error) {
			if err := RequireCapability(auth.User(e), Academic); err != nil {
				return Body{}, err
			}
			return readJSONBody(e)
		}
		root := "/ops/course-operations/" + resource
		router.POST(root, ops(func(e *core.RequestEvent) error {
			return Command(e, "create"+resource, func() (map[string]any, error) {
				body, err := academicBody(e)
				if err != nil {
					return nil, err
				}
				return createResource(e.App, resource, actorOf(e), body)
			})
		}))
		router.PATCH(root+"/{id}", ops(func(e *core.RequestEvent) error {
			return Command(e, "update"+resource, func() (map[string]any, error) {
				body, err := academicBody(e)
				if err != nil {
					return nil, err
				}
				return updateResource(e.App, resource, path(e, "id"), actorOf(e), body, nil)
			})
		}))
		router.POST(root+"/{id}/status", ops(func(e *core.RequestEvent) error {
			return Command(e, "set"+resource+"Status", func() (map[string]any, error) {
				body, err := academicBody(e)
				if err != nil {
					return nil, err
				}
				return setStatus(e.App, resource, path(e, "id"), body.Get("status"), body.Get("reason"), actorOf(e))
			})
		}))
	}

	for _, route := range sessionReads {
		read := route
		names := listQueryNames
		if len(read.capabilities) > 1 {
			names = sessionQueryNames
		}
		router.GET(read.path, ops(func(e *core.RequestEvent) error {
			return Query(e, func() (any, error) {
				if err := requireSome(auth.User(e), read.capabilities); err != nil {
					return nil, err
				}
				return listResource(e.App, read.resource, queryParams(e, names...))
			})
		}))
		router.GET(read.path+"/{id}", ops(func(e *core.RequestEvent) error {
			return Query(e, func() (any, error) {
				if err := requireSome(auth.User(e), read.capabilities); err != nil {
					return nil, err
				}
				return getResource(e.App, read.resource, path(e, "id"))
			})
		}))
	}
	assigned := func(names []string, run func(core.App, map[string]any, map[string]string) (page, error)) func(*core.RequestEvent) error {
		return ops(func(e *core.RequestEvent) error {
			return Query(e, func() (any, error) {
				user := auth.User(e)
				if err := RequireAnyCapability(user, Academic, Teacher); err != nil {
					return nil, err
				}
				return run(e.App, user, queryParams(e, names...))
			})
		})
	}
	router.GET("/ops/course-credits/assigned-students", assigned([]string{"page", "perPage", "q", "keyword", "status", "studentId"}, listAssignedStudents))
	router.GET("/ops/course-credits/assigned-classes", assigned([]string{"page", "perPage", "status", "classId"}, listAssignedClasses))
	router.GET("/ops/course-credits/assigned-lessons", assigned([]string{"page", "perPage", "status", "sessionId", "from", "to"}, listAssignedLessons))

	router.GET("/ops/course-calendar", ops(func(e *core.RequestEvent) error {
		return Query(e, func() (any, error) {
			user := auth.User(e)
			if err := RequireAnyCapability(user, Academic, Teacher); err != nil {
				return nil, err
			}
			query := queryParams(e, "from", "to", "teacherId", "studentId", "classId", "courseSpecId", "status", "originType")
			if explicitAcademic(user) {
				return institutionCalendar(e.App, query)
			}
			return teacherOpsCalendar(e.App, auth.ClaimString(user, "id"), query)
		})
	}))
	teacherSchedule := m.Signer.RequireSession(func(e *core.RequestEvent) error {
		return Query(e, func() (any, error) {
			teacherID, err := requireBookingTeacher(auth.User(e))
			if err != nil {
				return nil, err
			}
			return teacherCalendar(e.App, teacherID, queryParams(e, "from", "to", "includeAvailability"))
		})
	})
	router.GET("/v1/teacher/calendar", teacherSchedule)
	router.GET("/v1/teacher/schedule", teacherSchedule)
	router.GET("/v1/schedule/upcoming", m.Signer.RequireSession(func(e *core.RequestEvent) error {
		return Query(e, func() (any, error) {
			user := auth.User(e)
			id, role := auth.ClaimString(user, "id"), auth.ClaimString(user, "role")
			if id == "" || (role != "student" && role != "teacher") {
				return nil, Fail("CALENDAR_ROLE_UNSUPPORTED", "当前身份不支持课程日程", nil)
			}
			return upcomingSchedule(e.App, role, id, queryParams(e, "limit"))
		})
	}))
}

// requireSome is requireCapability for one capability and requireAnyCapability for several.
func requireSome(user auth.Claims, capabilities []string) error {
	if len(capabilities) == 1 {
		return RequireCapability(user, capabilities[0])
	}
	return RequireAnyCapability(user, capabilities...)
}
