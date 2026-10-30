package coursecredit

import (
	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/ids"
	"kanyue.server/internal/tenancy"
)

// BookingModule serves one-to-one course booking: student requests, the
// teacher workbench, ops booking configuration and the appointment workers.
// Calendars live in SessionsModule; it also serves the schedule claim backfill.
// It also schedules the expire/fulfill workers, which Hono left to manual runs.
type BookingModule struct {
	Signer             *auth.Signer
	ReservationEnabled bool
}

const (
	bookingExpirySchedule      = "*/5 * * * *"
	bookingFulfillmentSchedule = "*/15 * * * *"
)

type bookingCommand func(e *core.RequestEvent, body Body, input map[string]any) (map[string]any, error)

func (m BookingModule) requireReservation() error {
	if m.ReservationEnabled {
		return nil
	}
	return Fail("COURSE_CREDIT_FEATURE_DISABLED", "课程点预约占用尚未开放", map[string]any{"feature": "reservation"})
}

func requireStudent(user auth.Claims) (string, error) {
	id := auth.ClaimString(user, "id")
	if id == "" || user["role"] != "student" {
		return "", Fail("COURSE_CREDIT_STUDENT_REQUIRED", "仅学员可预约课程点", nil)
	}
	return id, nil
}

func requireBookingTeacher(user auth.Claims) (string, error) {
	id := auth.ClaimString(user, "id")
	if user["role"] != "teacher" || id == "" {
		return "", Fail("BOOKING_TEACHER_REQUIRED", "仅教师可以使用预约工作台", nil)
	}
	return id, RequireCapability(user, Teacher)
}

// existingStudent is the ops handlers' check that the chosen student exists.
func existingStudent(app core.App, studentID any) (string, error) {
	id, ok := studentID.(string)
	if !ok || id == "" {
		return "", Fail("BOOKING_STUDENT_REQUIRED", "请选择学员", nil)
	}
	student, err := get(app, "students", id)
	if err != nil {
		return "", err
	}
	return student["id"].(string), nil
}

func (m BookingModule) Register(se *core.ServeEvent) {
	router := se.Router
	session := m.Signer.RequireSession
	ops := func(handler func(*core.RequestEvent) error) func(*core.RequestEvent) error {
		return m.Signer.RequireOps(false, handler)
	}
	path := func(e *core.RequestEvent, name string) string { return e.Request.PathValue(name) }

	studentQuery := func(fn func(e *core.RequestEvent, studentID string) (any, error)) func(*core.RequestEvent) error {
		return session(func(e *core.RequestEvent) error {
			return Query(e, func() (any, error) {
				studentID, err := requireStudent(auth.User(e))
				if err != nil {
					return nil, err
				}
				return fn(e, studentID)
			})
		})
	}
	studentCommand := func(name string, route func(e *core.RequestEvent, studentID string) map[string]any,
		run func(core.App, map[string]any) (map[string]any, error)) func(*core.RequestEvent) error {
		return session(func(e *core.RequestEvent) error {
			return Command(e, name, func() (map[string]any, error) {
				studentID, err := requireStudent(auth.User(e))
				if err != nil {
					return nil, err
				}
				body, err := readOptionalJSONBody(e)
				if err != nil {
					return nil, err
				}
				return run(e.App, bookingInput(body, actorOf(e), route(e, studentID)))
			})
		})
	}
	teacherQuery := func(fn func(e *core.RequestEvent, teacherID string) (any, error)) func(*core.RequestEvent) error {
		return session(func(e *core.RequestEvent) error {
			return Query(e, func() (any, error) {
				teacherID, err := requireBookingTeacher(auth.User(e))
				if err != nil {
					return nil, err
				}
				return fn(e, teacherID)
			})
		})
	}
	teacherCommand := func(name, param string, run func(core.App, map[string]any) (map[string]any, error), gated bool) func(*core.RequestEvent) error {
		return session(func(e *core.RequestEvent) error {
			return Command(e, name, func() (map[string]any, error) {
				if gated {
					if err := m.requireReservation(); err != nil {
						return nil, err
					}
				}
				teacherID, err := requireBookingTeacher(auth.User(e))
				if err != nil {
					return nil, err
				}
				body, err := readOptionalJSONBody(e)
				if err != nil {
					return nil, err
				}
				return run(e.App, bookingInput(body, actorOf(e), map[string]any{param: path(e, param), "teacherId": teacherID}))
			})
		})
	}
	opsQuery := func(fn func(e *core.RequestEvent) (any, error)) func(*core.RequestEvent) error {
		return ops(func(e *core.RequestEvent) error {
			return Query(e, func() (any, error) {
				if err := RequireCapability(auth.User(e), Academic); err != nil {
					return nil, err
				}
				return fn(e)
			})
		})
	}
	opsCommand := func(name string, fn bookingCommand, gated bool) func(*core.RequestEvent) error {
		return ops(func(e *core.RequestEvent) error {
			return Command(e, name, func() (map[string]any, error) {
				if gated {
					if err := m.requireReservation(); err != nil {
						return nil, err
					}
				}
				if err := RequireCapability(auth.User(e), Academic); err != nil {
					return nil, err
				}
				body, err := readOptionalJSONBody(e)
				if err != nil {
					return nil, err
				}
				actor := actorOf(e)
				actor.Role = "admin"
				return fn(e, body, bookingInput(body, actor, nil))
			})
		})
	}
	// opsRoute runs a command with one path parameter merged over the body.
	opsRoute := func(name, param string, run func(core.App, map[string]any) (map[string]any, error), gated bool) func(*core.RequestEvent) error {
		return opsCommand(name, func(e *core.RequestEvent, _ Body, input map[string]any) (map[string]any, error) {
			if param != "" {
				input[param] = path(e, param)
			}
			return run(e.App, input)
		}, gated)
	}

	router.GET("/v1/student/booking-options", studentQuery(func(e *core.RequestEvent, studentID string) (any, error) {
		return studentBookingOptions(e.App, studentID, queryParams(e, "courseId")["courseId"])
	}))
	router.GET("/v1/student/booking-slots", studentQuery(func(e *core.RequestEvent, studentID string) (any, error) {
		return availableSlots(e.App, studentID, queryParams(e, "offeringId", "from", "to"))
	}))
	router.GET("/v1/student/appointments", studentQuery(func(e *core.RequestEvent, studentID string) (any, error) {
		return listStudentAppointments(e.App, studentID, queryParams(e, "page", "perPage", "status"))
	}))
	router.GET("/v1/student/appointments/{appointmentId}", studentQuery(func(e *core.RequestEvent, studentID string) (any, error) {
		return getStudentAppointment(e.App, studentID, path(e, "appointmentId"))
	}))
	router.GET("/v1/student/appointments/{appointmentId}/cancellation-preview", studentQuery(func(e *core.RequestEvent, studentID string) (any, error) {
		return previewCancellation(e.App, studentID, path(e, "appointmentId"))
	}))
	router.POST("/v1/student/appointments", studentCommand("requestAppointment", func(_ *core.RequestEvent, studentID string) map[string]any {
		return map[string]any{"studentId": studentID}
	}, requestAppointment))
	appointmentOf := func(e *core.RequestEvent, studentID string) map[string]any {
		return map[string]any{"appointmentId": path(e, "appointmentId"), "studentId": studentID}
	}
	router.POST("/v1/student/appointments/{appointmentId}/withdraw", studentCommand("withdrawAppointment", appointmentOf, withdrawAppointment))
	router.POST("/v1/student/appointments/{appointmentId}/cancel", studentCommand("cancelAppointment", appointmentOf, cancelAppointment))

	router.GET("/v1/teacher/booking/dashboard", teacherQuery(func(e *core.RequestEvent, teacherID string) (any, error) {
		return teacherBookingDashboard(e.App, teacherID)
	}))
	router.GET("/v1/teacher/appointments", teacherQuery(func(e *core.RequestEvent, teacherID string) (any, error) {
		return listTeacherAppointments(e.App, teacherID, queryParams(e, "page", "perPage", "status"))
	}))
	router.GET("/v1/teacher/appointments/{appointmentId}", teacherQuery(func(e *core.RequestEvent, teacherID string) (any, error) {
		return getTeacherAppointment(e.App, teacherID, path(e, "appointmentId"))
	}))
	router.GET("/v1/teacher/offerings/{offeringId}/availability", teacherQuery(func(e *core.RequestEvent, teacherID string) (any, error) {
		return teacherAvailability(e.App, teacherID, path(e, "offeringId"))
	}))
	router.POST("/v1/teacher/appointments/{appointmentId}/confirm", teacherCommand("confirmAppointment", "appointmentId", confirmAppointment, true))
	router.POST("/v1/teacher/appointments/{appointmentId}/decline", teacherCommand("declineAppointment", "appointmentId", declineAppointment, false))
	router.POST("/v1/teacher/appointments/{appointmentId}/cancel", teacherCommand("cancelAppointment", "appointmentId", cancelAppointment, false))
	router.POST("/v1/teacher/appointments/{appointmentId}/reschedule", teacherCommand("rescheduleAppointment", "appointmentId", rescheduleAppointment, false))
	router.PUT("/v1/teacher/offerings/{offeringId}/availability", teacherCommand("saveTeacherAvailability", "offeringId", saveWeeklyAvailability, false))
	router.POST("/v1/teacher/offerings/{offeringId}/availability-overrides", teacherCommand("createTeacherAvailabilityOverride", "offeringId", createAvailabilityOverride, false))
	router.POST("/v1/teacher/availability-overrides/{overrideId}/cancel", teacherCommand("cancelTeacherAvailabilityOverride", "overrideId", cancelAvailabilityOverride, false))

	router.GET("/ops/course-bookings/dashboard", opsQuery(func(e *core.RequestEvent) (any, error) {
		return opsBookingDashboard(e.App)
	}))
	router.GET("/ops/course-bookings/reference-data", opsQuery(func(e *core.RequestEvent) (any, error) {
		return opsBookingReferenceData(e.App)
	}))
	router.GET("/ops/course-bookings/appointments", opsQuery(func(e *core.RequestEvent) (any, error) {
		return opsAppointments(e.App, queryParams(e, "page", "perPage", "status", "teacherId", "studentId", "courseSpecId", "from", "to"))
	}))
	router.GET("/ops/course-bookings/appointments/{appointmentId}", opsQuery(func(e *core.RequestEvent) (any, error) {
		return opsAppointment(e.App, path(e, "appointmentId"))
	}))
	router.GET("/ops/course-bookings/students/{studentId}/options", opsQuery(func(e *core.RequestEvent) (any, error) {
		studentID, err := existingStudent(e.App, path(e, "studentId"))
		if err != nil {
			return nil, err
		}
		return studentBookingOptions(e.App, studentID, queryParams(e, "courseId")["courseId"])
	}))
	router.GET("/ops/course-bookings/students/{studentId}/slots", opsQuery(func(e *core.RequestEvent) (any, error) {
		studentID, err := existingStudent(e.App, path(e, "studentId"))
		if err != nil {
			return nil, err
		}
		return availableSlots(e.App, studentID, queryParams(e, "offeringId", "from", "to"))
	}))
	router.GET("/ops/course-bookings/policies", opsQuery(func(e *core.RequestEvent) (any, error) {
		return opsPolicies(e.App, queryParams(e, "page", "perPage", "status"))
	}))
	router.GET("/ops/course-bookings/offerings", opsQuery(func(e *core.RequestEvent) (any, error) {
		return opsOfferings(e.App, queryParams(e, "page", "perPage", "status", "teacherId", "courseSpecId"))
	}))
	router.GET("/ops/course-bookings/availability", opsQuery(func(e *core.RequestEvent) (any, error) {
		return opsAvailability(e.App, queryParams(e, "status", "teacherId", "offeringId"))
	}))
	router.GET("/ops/course-bookings/backfill/preview", opsQuery(func(e *core.RequestEvent) (any, error) {
		return backfillPreview(e.App, queryParams(e, "from", "to"))
	}))
	router.GET("/ops/course-bookings/conflicts", opsQuery(func(e *core.RequestEvent) (any, error) {
		return opsConflicts(e.App, queryParams(e, "page", "perPage", "status", "teacherId"))
	}))

	router.POST("/ops/course-bookings/appointments", opsCommand("requestAppointment", m.createOpsAppointment, false))
	router.POST("/ops/course-bookings/appointments/{appointmentId}/confirm", opsRoute("confirmAppointment", "appointmentId", confirmAppointment, true))
	router.POST("/ops/course-bookings/appointments/{appointmentId}/decline", opsRoute("declineAppointment", "appointmentId", declineAppointment, false))
	router.POST("/ops/course-bookings/appointments/{appointmentId}/reschedule", opsRoute("rescheduleAppointment", "appointmentId", rescheduleAppointment, false))
	router.POST("/ops/course-bookings/appointments/{appointmentId}/cancel", opsCommand("cancelAppointment", func(e *core.RequestEvent, _ Body, input map[string]any) (map[string]any, error) {
		if input["cancellationType"] == "institution" {
			if err := RequireCapability(auth.User(e), Finance); err != nil {
				return nil, err
			}
		}
		input["appointmentId"] = path(e, "appointmentId")
		return cancelAppointment(e.App, input)
	}, false))
	router.POST("/ops/course-bookings/policies", opsRoute("configureBookingPolicy", "", createPolicyRevision, false))
	saveOfferingRoute := opsCommand("configureBookingOffering", func(e *core.RequestEvent, _ Body, input map[string]any) (map[string]any, error) {
		input["offeringId"] = orChain(path(e, "offeringId"), input["offeringId"], "")
		return saveOffering(e.App, input)
	}, false)
	router.POST("/ops/course-bookings/offerings", saveOfferingRoute)
	router.PATCH("/ops/course-bookings/offerings/{offeringId}", saveOfferingRoute)
	router.PUT("/ops/course-bookings/offerings/{offeringId}/availability", opsRoute("saveTeacherAvailability", "offeringId", func(app core.App, input map[string]any) (map[string]any, error) {
		return forOfferingTeacher(app, input, saveWeeklyAvailability)
	}, false))
	router.POST("/ops/course-bookings/offerings/{offeringId}/availability-overrides", opsRoute("createTeacherAvailabilityOverride", "offeringId", func(app core.App, input map[string]any) (map[string]any, error) {
		return forOfferingTeacher(app, input, createAvailabilityOverride)
	}, false))
	router.POST("/ops/course-bookings/availability-overrides/{overrideId}/cancel", opsRoute("cancelTeacherAvailabilityOverride", "overrideId", cancelOverrideForOperator, false))
	router.POST("/ops/course-bookings/conflicts/{conflictId}/resolve", opsRoute("resolveBookingConflict", "conflictId", resolveConflict, false))
	router.POST("/ops/course-bookings/backfill", opsRoute("backfillScheduleClaims", "", backfillScheduleClaims, false))
	router.POST("/ops/course-bookings/workers/expire", opsRoute("expireAppointments", "", expireAppointments, false))
	router.POST("/ops/course-bookings/workers/fulfill", opsRoute("fulfillAppointments", "", fulfillAppointments, false))

	m.schedule(se.App)
}

// createOpsAppointment books for a student; with confirm it also confirms in one
// step and withdraws the request again when confirmation does not hold.
func (m BookingModule) createOpsAppointment(e *core.RequestEvent, body Body, metadata map[string]any) (map[string]any, error) {
	confirm := body.Values["confirm"] == true
	if confirm {
		if err := m.requireReservation(); err != nil {
			return nil, err
		}
	}
	studentID, err := existingStudent(e.App, body.Values["studentId"])
	if err != nil {
		return nil, err
	}
	command := func(fields map[string]any) map[string]any {
		input := map[string]any{"actorId": metadata["actorId"], "actorRole": metadata["actorRole"],
			"idempotencyKey": metadata["idempotencyKey"], "traceId": metadata["traceId"]}
		for key, value := range fields {
			input[key] = value
		}
		return input
	}
	request := command(map[string]any{"studentId": studentID})
	for _, key := range []string{"offeringId", "startAt", "endAt", "note"} {
		if value, ok := body.Values[key]; ok {
			request[key] = value
		}
	}
	requested, err := requestAppointment(e.App, request)
	if err != nil || !confirm || requested["status"] != "pending" {
		return requested, err
	}
	appointmentID := requested["appointmentId"]
	confirmed, err := confirmAppointment(e.App, command(map[string]any{
		"idempotencyKey": metadata["idempotencyKey"].(string) + ":confirm", "appointmentId": appointmentID,
	}))
	if err == nil && confirmed["status"] != "confirmed" {
		message := "预约未能确认，已关闭"
		if confirmed["status"] == "eligibility_lost" {
			message = "学员可用课时不足，预约未成立"
		}
		err = Fail("APPOINTMENT_CONFIRM_CLOSED", message, map[string]any{"status": confirmed["status"]})
	}
	if err != nil {
		// A one-step booking must not strand a pending request that blocks the next attempt for this course.
		_, _ = withdrawAppointment(e.App, command(map[string]any{
			"idempotencyKey": metadata["idempotencyKey"].(string) + ":withdraw", "appointmentId": appointmentID,
			"studentId": studentID, "reason": "代约确认失败，已自动撤回",
		}))
		return nil, err
	}
	result := copyMap(requested)
	for key, value := range confirmed {
		result[key] = value
	}
	result["appointmentId"] = appointmentID
	return result, nil
}

// schedule registers the in-process appointment workers. A tick with nothing
// to transition is skipped so idle periods do not write empty operations.
func (m BookingModule) schedule(app core.App) {
	run := func(app core.App, name, filter string, worker func(core.App, map[string]any) (map[string]any, error)) {
		due, err := findFirst(app, "appointment_requests", filter)
		if err != nil {
			app.Logger().Error("course-booking worker check failed", "worker", name, "error", err.Error())
			return
		}
		if due == nil {
			return
		}
		input := map[string]any{"actorId": "system", "actorRole": "system",
			"idempotencyKey": "cron-" + ids.Record(), "traceId": "cron-" + name + "-" + ids.Record()}
		if _, err := worker(app, input); err != nil {
			app.Logger().Error("course-booking worker failed", "worker", name, "error", err.Error())
		}
	}
	app.Cron().MustAdd("courseBookingExpiry", bookingExpirySchedule, tenancy.Job(app, "courseBookingExpiry", func(app core.App) {
		run(app, "expire", expireFilter(iso(clock())), expireAppointments)
	}))
	app.Cron().MustAdd("courseBookingFulfillment", bookingFulfillmentSchedule, tenancy.Job(app, "courseBookingFulfillment", func(app core.App) {
		run(app, "fulfill", fulfillFilter, fulfillAppointments)
	}))
}
