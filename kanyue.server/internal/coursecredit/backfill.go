package coursecredit

import (
	"slices"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/ids"
	"kanyue.server/internal/jsx"
)

// Schedule claim backfill: Hono's ScheduleClaimBackfillService. Sessions scheduled
// before booking existed get their calendar claims; overlaps become conflicts and
// stop the involved teachers' offerings until an operator resolves them.

const backfillBatchLimit = 400

type backfillEntry struct {
	session map[string]any
	plan    []step
}

type backfillReport struct {
	claimed   []string
	conflicts []map[string]any
	ready     []backfillReady
	scanned   int
}

type backfillReady struct {
	sessionID string
	requests  []step
}

// backfillPreview answers the admin's BookingBackfillPreview: counts plus the
// conflict rows apply would record.
func backfillPreview(app core.App, query map[string]string) (any, error) {
	input := map[string]any{}
	for key, value := range query {
		input[key] = value
	}
	report, err := scanBackfill(app, input)
	if err != nil {
		return nil, err
	}
	conflicts := make([]any, 0, len(report.conflicts))
	for _, item := range report.conflicts {
		conflicts = append(conflicts, backfillConflictRecord(item))
	}
	return map[string]any{
		"claimed": len(report.ready), "conflicts": conflicts,
		"ready": len(report.conflicts) == 0, "scannedCount": report.scanned,
	}, nil
}

func backfillScheduleClaims(app core.App, input map[string]any) (map[string]any, error) {
	request := map[string]any{"from": or(input["from"], ""), "to": or(input["to"], "")}
	t, err := prepareTeaching(app, "backfillScheduleClaims", input, request)
	if err != nil || t.replayed != nil {
		return t.replayed, err
	}
	report, err := scanBackfill(app, input)
	if err != nil {
		return nil, err
	}
	teacherIDs := []string{}
	for _, item := range report.conflicts {
		if id := jsx.String(item["ownerId"]); item["ownerType"] == "teacher" && !slices.Contains(teacherIDs, id) {
			teacherIDs = append(teacherIDs, id)
		}
	}
	offerings := []map[string]any{}
	for _, teacherID := range teacherIDs {
		rows, err := list(app, "teacher_course_offerings", `teacherId="`+escape(teacherID)+`" && status="active"`, "courseSpecId,id")
		if err != nil {
			return nil, err
		}
		offerings = append(offerings, rows...)
	}
	claimedIDs, disabledIDs := []any{}, []any{}
	for _, item := range report.ready {
		claimedIDs = append(claimedIDs, item.sessionID)
	}
	for _, offering := range offerings {
		disabledIDs = append(disabledIDs, offering["id"])
	}
	result := map[string]any{
		"claimedSessionIds": claimedIDs, "conflictCount": len(report.conflicts),
		"disabledOfferingIds": disabledIDs, "operationId": t.operationID, "scannedCount": report.scanned,
	}
	plan := []step{t.operation(input, "backfill_schedule_claims", "schedule_backfill", t.at, "", request, result)}
	for _, item := range report.ready {
		plan = append(plan, item.requests...)
	}
	for _, item := range report.conflicts {
		plan = append(plan, create("booking_conflicts", backfillConflictRecord(item)))
	}
	for _, offering := range offerings {
		id := jsx.String(offering["id"])
		version := positiveVersion(offering["version"])
		plan = append(plan, versionClaim("teacher_offering", id, version, t.operationID),
			update("teacher_course_offerings", id, map[string]any{"status": "inactive", "version": version + 1}))
	}
	plan = append(plan, outbox("course-booking.schedule-backfilled", "schedule_backfill", t.at, result))
	if len(plan) > backfillBatchLimit {
		return nil, Fail("BOOKING_BACKFILL_BATCH_TOO_LARGE", "回填数据量过大，请缩小时间范围", map[string]any{"requestCount": len(plan)})
	}
	return t.commit(app, plan, result)
}

// scanBackfill is preview(): future scheduled sessions against the active claims in range.
func scanBackfill(app core.App, input map[string]any) (backfillReport, error) {
	from, err := backfillBound(input["from"], iso(clock()))
	if err != nil {
		return backfillReport{}, err
	}
	to, err := backfillBound(input["to"], "")
	if err != nil {
		return backfillReport{}, err
	}
	sessionFilter := `(status="scheduled" || status="enrollment_closed") && startAt>="` + escape(filterTime(from)) + `"`
	claimFilter := `status="active" && cellEndAt>"` + escape(filterTime(from)) + `"`
	if to != "" {
		sessionFilter += ` && startAt<"` + escape(filterTime(to)) + `"`
		claimFilter += ` && cellStartAt<"` + escape(filterTime(to)) + `"`
	}
	sessions, err := list(app, "sessions", sessionFilter, "startAt,id")
	if err != nil {
		return backfillReport{}, err
	}
	existing, err := list(app, "schedule_claims", claimFilter, "cellStartAt,ownerType,ownerId")
	if err != nil {
		return backfillReport{}, err
	}
	entries := make([]backfillEntry, 0, len(sessions))
	for _, session := range sessions {
		filter := `sessionId="` + escape(jsx.String(session["id"])) + `"`
		students, err := list(app, "session_students", filter, "studentId,id")
		if err != nil {
			return backfillReport{}, err
		}
		teachers, err := list(app, "session_teachers", filter, "teacherId,role,id")
		if err != nil {
			return backfillReport{}, err
		}
		plan, err := sessionClaimPlan(relationID(session["appointmentId"]), session["startAt"], session["endAt"],
			jsx.String(session["id"]), uniqueRelations(teachers, "teacherId"), uniqueRelations(students, "studentId"))
		if err != nil {
			return backfillReport{}, err
		}
		entries = append(entries, backfillEntry{session, plan})
	}
	return buildBackfillReport(entries, existing), nil
}

// backfillBound is `input.x ? new Date(input.x).toISOString() : fallback`; Hono
// threw a RangeError (500) on an unparseable bound.
func backfillBound(value any, fallback string) (string, error) {
	if !jsx.Truthy(value) {
		return fallback, nil
	}
	ms, ok := millis(value)
	if !ok {
		return "", Fail("BOOKING_BACKFILL_RANGE_INVALID", "回填时间范围无效", nil)
	}
	return fromMillis(ms), nil
}

func buildBackfillReport(entries []backfillEntry, existing []map[string]any) backfillReport {
	occupied := map[string]map[string]any{}
	for _, claim := range existing {
		if claim["status"] == "active" {
			occupied[claimKey(claim)] = claim
		}
	}
	report := backfillReport{claimed: []string{}, conflicts: []map[string]any{}, ready: []backfillReady{}, scanned: len(entries)}
	for _, entry := range entries {
		sessionID := jsx.String(entry.session["id"])
		if len(entry.plan) == 0 {
			report.conflicts = append(report.conflicts, map[string]any{
				"ownerType": "room", "ownerId": sessionID, "sessionId": sessionID,
				"startAt": entry.session["startAt"], "endAt": entry.session["endAt"], "reason": "missing_teacher_or_student",
			})
			continue
		}
		collisions := []map[string]any{}
		alreadyClaimed := true
		for _, request := range entry.plan {
			occupiedClaim := occupied[claimKey(request.data)]
			if occupiedClaim == nil || jsx.String(occupiedClaim["sourceId"]) != sessionID {
				alreadyClaimed = false
			}
			if occupiedClaim == nil || jsx.String(occupiedClaim["sourceId"]) == sessionID {
				continue
			}
			collision := copyMap(request.data)
			collision["conflictingSourceId"] = occupiedClaim["sourceId"]
			collision["endAt"] = entry.session["endAt"]
			collision["sessionId"] = sessionID
			collision["startAt"] = entry.session["startAt"]
			collisions = append(collisions, collision)
		}
		if len(collisions) > 0 {
			report.conflicts = append(report.conflicts, collisions...)
			continue
		}
		if alreadyClaimed {
			report.claimed = append(report.claimed, sessionID)
			continue
		}
		requests := []step{}
		for _, request := range entry.plan {
			if _, taken := occupied[claimKey(request.data)]; !taken {
				requests = append(requests, request)
			}
		}
		for _, request := range requests {
			occupied[claimKey(request.data)] = request.data
		}
		report.ready = append(report.ready, backfillReady{sessionID, requests})
	}
	return report
}

func backfillConflictRecord(item map[string]any) map[string]any {
	teacherID, studentID := "", ""
	switch item["ownerType"] {
	case "teacher":
		teacherID = jsx.String(item["ownerId"])
	case "student":
		studentID = jsx.String(item["ownerId"])
	}
	return map[string]any{
		"id": ids.Record(), "type": "backfill_overlap", "status": "open",
		"teacherId": teacherID, "studentId": studentID, "sessionId": item["sessionId"], "appointmentId": "",
		"startAt": item["startAt"], "endAt": item["endAt"],
		"details": map[string]any{
			"cellStartAt":         or(item["cellStartAt"], ""),
			"conflictingSourceId": or(item["conflictingSourceId"], ""),
			"reason":              or(item["reason"], "schedule_overlap"),
		},
		"resolution": "", "resolvedAt": "", "version": 1,
	}
}

// claimKey identifies a calendar cell; cellStartAt is normalized so PocketBase's
// "YYYY-MM-DD HH:MM:SS.sssZ" matches the ISO form a fresh plan carries.
func claimKey(claim map[string]any) string {
	return jsx.String(claim["ownerType"]) + ":" + jsx.String(claim["ownerId"]) + ":" + normalizedCellStart(claim["cellStartAt"])
}

func normalizedCellStart(value any) string {
	if ms, ok := millis(value); ok {
		return fromMillis(ms)
	}
	if !jsx.Truthy(value) {
		return ""
	}
	return jsx.String(value)
}
