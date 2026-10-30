package coursecredit

import (
	"database/sql"
	"errors"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/jsx"
)

// Renewal reminders: a daily scan and ops sends that point students, signed as
// 看乐教务, to the fixed-price course packages before their lessons run out.
// Teachers only see who is due; they never send or talk price.

const (
	renewalLowLessons   = 2.0
	renewalExpiryDays   = 14
	renewalCooldown     = 7 * dayMillis
	renewalRoundLimit   = 3
	renewalSchedule     = "0 2 * * *" // 10:00 Asia/Shanghai; cron runs in UTC
	renewalSender       = "看乐教务"
	renewalBatchLimit   = 100
	renewalTeacherDays  = 180
	renewalHistoryDays  = 90
	renewalSubscribeCap = 10
	renewalUnreadLimit  = 3
)

// renewalCourse is one student's course as the reminder rules see it.
type renewalCourse struct {
	studentID, courseID, courseName string
	remaining, used                 float64
	awaitingActivation, lapsed      bool
	// expiresAt is the earliest future expiry of a batch that still holds lessons; 0 when none.
	expiresAt int64
	// roundKey changes with every new grant, which closes the previous round.
	roundKey string
}

// renewalReason is the eligibility rule: "low_balance", "expiring" or "" for no reminder.
func renewalReason(course renewalCourse, now time.Time) string {
	if course.awaitingActivation || course.lapsed {
		return ""
	}
	// A fresh trial of two lessons is not low yet; only courses already in use are.
	if course.used > 0 && course.remaining <= renewalLowLessons {
		return "low_balance"
	}
	if course.expiresAt > 0 && course.expiresAt <= now.UnixMilli()+renewalExpiryDays*dayMillis {
		return "expiring"
	}
	return ""
}

// renewalCourses groups course batches per student through the learning summaries.
func renewalCourses(batches []map[string]any, now time.Time) []renewalCourse {
	order := []string{}
	byStudent := map[string][]map[string]any{}
	for _, batch := range batches {
		id := relationID(batch["studentId"])
		if _, ok := byStudent[id]; !ok {
			order = append(order, id)
		}
		byStudent[id] = append(byStudent[id], batch)
	}
	nowMs := now.UnixMilli()
	result := []renewalCourse{}
	for _, studentID := range order {
		own := byStudent[studentID]
		for _, summary := range buildCourseSummaries(own, now) {
			course := renewalCourse{
				studentID:          studentID,
				courseID:           jsx.String(summary.get("courseId")),
				courseName:         jsx.String(summary.get("courseName")),
				remaining:          summary.get("remainingLessons").(float64),
				used:               summary.get("completedLessons").(float64) + summary.get("expiredLessons").(float64),
				awaitingActivation: summary.get("awaitingActivation") == true,
			}
			var latest map[string]any
			for _, batch := range own {
				if courseIdentity(batch) != course.courseID {
					continue
				}
				expiry, ok := millis(or(batch["effectiveExpiresAt"], ""))
				if ok && expiry > nowMs && quantity(batch["availableQuantity"]) > 0 && (course.expiresAt == 0 || expiry < course.expiresAt) {
					course.expiresAt = expiry
				}
				if latest == nil || newerBatch(batch, latest) {
					latest = batch
				}
			}
			// Nothing left and the newest grant ran out by time: a sales conversation, not a reminder.
			course.lapsed = course.remaining == 0 && latest["status"] == "expired"
			course.roundKey = studentID + ":" + course.courseID + ":" + jsx.String(latest["id"])
			result = append(result, course)
		}
	}
	return result
}

func newerBatch(left, right map[string]any) bool {
	leftAt, rightAt := jsx.String(left["created"]), jsx.String(right["created"])
	if leftAt != rightAt {
		return leftAt > rightAt
	}
	return jsx.String(left["id"]) > jsx.String(right["id"])
}

// loadRenewalCourses reads course batches for the given students, or everyone when nil.
func loadRenewalCourses(app core.App, studentIDs []string, now time.Time) ([]renewalCourse, error) {
	filter := `status!="cancelled" && creditTypeId.kind="course"`
	if studentIDs != nil {
		if len(studentIDs) == 0 {
			return nil, nil
		}
		filter += " && " + anyFilter("studentId", studentIDs)
	}
	batches, err := list(app, "credit_batches", filter, "studentId,created", "creditTypeId", "creditTypeId.courseSpecId")
	if err != nil {
		return nil, err
	}
	return renewalCourses(batches, now), nil
}

// renewalTarget picks a student's most urgent course; reason is "manual" when none is due.
func renewalTarget(courses []renewalCourse, studentID string, now time.Time) (renewalCourse, string, bool) {
	rank := map[string]int{"low_balance": 0, "expiring": 1, "": 2}
	var best renewalCourse
	bestReason, found := "", false
	for _, course := range courses {
		if course.studentID != studentID || course.awaitingActivation {
			continue
		}
		reason := renewalReason(course, now)
		if !found || rank[reason] < rank[bestReason] || (rank[reason] == rank[bestReason] && course.remaining < best.remaining) {
			best, bestReason, found = course, reason, true
		}
	}
	if found && bestReason == "" {
		bestReason = "manual"
	}
	return best, bestReason, found
}

func renewalDate(ms int64) string {
	if ms == 0 {
		return ""
	}
	return localPartsAt(ms).date
}

// renewalMessage states only remaining lessons and the expiry date: no price, no teacher.
func renewalMessage(course renewalCourse, reason string) string {
	remaining := strconv.FormatFloat(course.remaining, 'f', -1, 64)
	text := "《" + course.courseName + "》"
	switch {
	case reason == "expiring":
		text += "剩余 " + remaining + " 节课时，将于 " + renewalDate(course.expiresAt) + " 到期。"
	case course.remaining <= 0:
		text += "课时已用完。"
	default:
		text += "剩余 " + remaining + " 节课时"
		if course.expiresAt > 0 {
			text += "，有效期至 " + renewalDate(course.expiresAt)
		}
		text += "。"
	}
	return text + "可在课包页查看续费课包。"
}

func saveReminder(app core.App, course renewalCourse, trigger, reason, dedupeKey, operatorID string) (*core.Record, error) {
	collection, err := app.FindCollectionByNameOrId("renewal_reminders")
	if err != nil {
		return nil, err
	}
	record := core.NewRecord(collection)
	record.Load(map[string]any{
		"studentId": course.studentID, "courseSpecId": course.courseID, "trigger": trigger, "reason": reason,
		"roundKey": course.roundKey, "dedupeKey": dedupeKey, "remainingLessons": course.remaining,
		"message": renewalMessage(course, reason), "operatorId": operatorID, "wechatStatus": "pending",
	})
	if course.expiresAt > 0 {
		record.Set("validUntil", fromMillis(course.expiresAt))
	}
	return record, app.Save(record)
}

// deliverRenewal tries WeChat after the in-app reminder is stored; its outcome never undoes that.
func deliverRenewal(app core.App, wechat *RenewalWechat, reminder *core.Record, course renewalCourse) {
	status, detail := "skipped", "未配置订阅消息模板"
	if wechat.TemplateID() != "" {
		status, detail = sendRenewalWechat(app, wechat, reminder, course)
	}
	reminder.Set("wechatStatus", status)
	reminder.Set("wechatError", jsx.Slice(detail, 300))
	if err := app.Save(reminder); err != nil {
		app.Logger().Error("renewal reminder delivery status not saved", "reminderId", reminder.Id, "error", err.Error())
	}
}

func sendRenewalWechat(app core.App, wechat *RenewalWechat, reminder *core.Record, course renewalCourse) (string, string) {
	openID, err := takeSubscription(app, course.studentID)
	if err != nil {
		return "failed", err.Error()
	}
	if openID == "" {
		return "skipped", "学员未授权订阅消息"
	}
	validUntil := renewalDate(course.expiresAt)
	if validUntil == "" {
		validUntil = "长期有效"
	}
	err = wechat.Send(openID, map[string]string{
		"course": course.courseName, "remaining": strconv.FormatFloat(course.remaining, 'f', -1, 64),
		"validUntil": validUntil, "message": reminder.GetString("message"), "sender": renewalSender,
	})
	if err != nil {
		return "failed", err.Error()
	}
	return "sent", ""
}

// takeSubscription uses one subscribe grant and returns the openId it belongs to; "" when none is left.
func takeSubscription(app core.App, studentID string) (string, error) {
	openID := ""
	err := app.RunInTransaction(func(tx core.App) error {
		record, err := tx.FindFirstRecordByFilter("renewal_subscriptions", "studentId={:id} && credits>0", dbx.Params{"id": studentID})
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		record.Set("credits", record.GetInt("credits")-1)
		openID = record.GetString("openId")
		return tx.Save(record)
	})
	return openID, err
}

// scanRenewals is the daily job: one automatic reminder per due course, within cooldown and round limits.
func scanRenewals(app core.App, wechat *RenewalWechat, now time.Time) (int, error) {
	courses, err := loadRenewalCourses(app, nil, now)
	if err != nil {
		return 0, err
	}
	autos, err := app.FindRecordsByFilter("renewal_reminders", `trigger="auto"`, "-created", 0, 0)
	if err != nil {
		return 0, err
	}
	lastAt, rounds := map[string]int64{}, map[string]int{}
	for _, reminder := range autos {
		key := reminder.GetString("studentId") + ":" + reminder.GetString("courseSpecId")
		if _, seen := lastAt[key]; !seen {
			lastAt[key] = reminder.GetDateTime("created").Time().UnixMilli()
		}
		rounds[reminder.GetString("roundKey")]++
	}
	created := 0
	for _, course := range courses {
		reason := renewalReason(course, now)
		if reason == "" {
			continue
		}
		if at, seen := lastAt[course.studentID+":"+course.courseID]; seen && now.UnixMilli()-at < renewalCooldown {
			continue
		}
		attempt := rounds[course.roundKey]
		if attempt >= renewalRoundLimit {
			continue
		}
		reminder, err := saveReminder(app, course, "auto", reason, course.roundKey+":"+strconv.Itoa(attempt), "")
		if err != nil {
			app.Logger().Error("renewal reminder not saved", "studentId", course.studentID, "courseId", course.courseID, "error", err.Error())
			continue
		}
		deliverRenewal(app, wechat, reminder, course)
		created++
	}
	return created, nil
}

// sendRenewalReminders is the ops send: one reminder per student per academy day.
func sendRenewalReminders(app core.App, wechat *RenewalWechat, body Body, actor Actor, now time.Time) (map[string]any, error) {
	values, _ := body.Get("studentIds").([]any)
	raw := make([]string, 0, len(values))
	for _, value := range values {
		if text, ok := value.(string); ok {
			raw = append(raw, text)
		}
	}
	studentIDs := uniqueIDs(raw)
	if len(studentIDs) == 0 || len(studentIDs) > renewalBatchLimit {
		return nil, Fail("RENEWAL_STUDENTS_INVALID", "请选择 1 到 100 名学员", nil)
	}
	courses, err := loadRenewalCourses(app, studentIDs, now)
	if err != nil {
		return nil, err
	}
	today := localPartsAt(now.UnixMilli()).date
	items, sent := []any{}, 0
	for _, studentID := range studentIDs {
		item := map[string]any{"studentId": studentID}
		items = append(items, item)
		course, reason, ok := renewalTarget(courses, studentID, now)
		if !ok {
			item["status"], item["message"] = "rejected", "该学员没有可提醒的课程"
			continue
		}
		dedupeKey := "manual:" + studentID + ":" + today
		existing, err := findFirst(app, "renewal_reminders", `dedupeKey="`+escape(dedupeKey)+`"`)
		if err != nil {
			return nil, err
		}
		if existing != nil {
			item["status"], item["message"] = "rejected", "今天已经提醒过该学员，明天再试"
			continue
		}
		reminder, err := saveReminder(app, course, "manual", reason, dedupeKey, actor.ID)
		if err != nil {
			return nil, err
		}
		deliverRenewal(app, wechat, reminder, course)
		item["status"], item["message"] = "sent", "已发送"
		item["reminderId"], item["wechatStatus"] = reminder.Id, reminder.GetString("wechatStatus")
		sent++
	}
	return map[string]any{"items": items, "sent": sent, "rejected": len(studentIDs) - sent}, nil
}

// renewalCandidates lists each due student's most urgent course, most urgent first.
func renewalCandidates(app core.App, studentIDs []string, now time.Time) ([]map[string]any, error) {
	courses, err := loadRenewalCourses(app, studentIDs, now)
	if err != nil {
		return nil, err
	}
	seen := map[string]bool{}
	type due struct {
		course renewalCourse
		reason string
	}
	rows := []due{}
	for _, course := range courses {
		if seen[course.studentID] {
			continue
		}
		seen[course.studentID] = true
		if best, reason, ok := renewalTarget(courses, course.studentID, now); ok && reason != "manual" {
			rows = append(rows, due{best, reason})
		}
	}
	slices.SortStableFunc(rows, func(left, right due) int {
		if left.reason != right.reason {
			return strings.Compare(right.reason, left.reason) // low_balance before expiring
		}
		if left.course.remaining != right.course.remaining {
			return sign(int64(left.course.remaining*1000) - int64(right.course.remaining*1000))
		}
		return strings.Compare(left.course.studentID, right.course.studentID)
	})
	ids := make([]string, len(rows))
	for i, row := range rows {
		ids[i] = row.course.studentID
	}
	names, err := studentNames(app, ids)
	if err != nil {
		return nil, err
	}
	items := make([]map[string]any, len(rows))
	for i, row := range rows {
		var validUntil any
		if row.course.expiresAt > 0 {
			validUntil = fromMillis(row.course.expiresAt)
		}
		items[i] = map[string]any{
			"studentId": row.course.studentID, "studentName": names[row.course.studentID],
			"courseId": row.course.courseID, "courseName": row.course.courseName, "reason": row.reason,
			"remainingLessons": row.course.remaining, "validUntil": validUntil,
		}
	}
	return items, nil
}

func studentNames(app core.App, ids []string) (map[string]string, error) {
	names := map[string]string{}
	if len(ids) == 0 {
		return names, nil
	}
	students, err := app.FindRecordsByIds("students", ids)
	if err != nil {
		return nil, err
	}
	for _, student := range students {
		names[student.Id] = jsx.String(or(or(student.GetString("realName"), student.GetString("nickName")), "学员"))
	}
	return names, nil
}

// opsRenewals adds each candidate's latest reminder and whether today's manual send is used.
func opsRenewals(app core.App, now time.Time) (any, error) {
	items, err := renewalCandidates(app, nil, now)
	if err != nil {
		return nil, err
	}
	since := filterTime(iso(now.Add(-renewalHistoryDays * 24 * time.Hour)))
	reminders, err := app.FindRecordsByFilter("renewal_reminders", "created>={:since}", "-created", 0, 0, dbx.Params{"since": since})
	if err != nil {
		return nil, err
	}
	today := localPartsAt(now.UnixMilli()).date
	for _, item := range items {
		item["lastReminder"], item["remindedToday"] = nil, false
		for _, reminder := range reminders {
			if reminder.GetString("studentId") != item["studentId"] {
				continue
			}
			if item["lastReminder"] == nil {
				item["lastReminder"] = map[string]any{
					"trigger": reminder.GetString("trigger"), "reason": reminder.GetString("reason"),
					"wechatStatus": reminder.GetString("wechatStatus"), "read": !reminder.GetDateTime("readAt").IsZero(),
					"created": iso(reminder.GetDateTime("created").Time()),
				}
			}
			if reminder.GetString("dedupeKey") == "manual:"+jsx.String(item["studentId"])+":"+today {
				item["remindedToday"] = true
			}
		}
	}
	return map[string]any{"items": items, "rules": map[string]any{
		"lowLessons": renewalLowLessons, "expiryDays": renewalExpiryDays,
		"cooldownDays": renewalCooldown / dayMillis, "roundLimit": renewalRoundLimit,
	}}, nil
}

// teacherRenewals is read-only: the teacher's students from recent and upcoming lessons.
func teacherRenewals(app core.App, teacherID string, now time.Time) (any, error) {
	since := filterTime(iso(now.Add(-renewalTeacherDays * 24 * time.Hour)))
	assignments, err := list(app, "session_teachers",
		`teacherId="`+escape(teacherID)+`" && actualStatus!="cancelled" && sessionId.startAt>="`+since+`"`, "")
	if err != nil {
		return nil, err
	}
	sessionIDs := []string{}
	for _, row := range assignments {
		sessionIDs = append(sessionIDs, relationID(row["sessionId"]))
	}
	sessionIDs = uniqueIDs(sessionIDs)
	studentIDs := []string{}
	for start := 0; start < len(sessionIDs); start += relationChunkSize {
		chunk := sessionIDs[start:min(start+relationChunkSize, len(sessionIDs))]
		roster, err := list(app, "session_students", anyFilter("sessionId", chunk)+` && attendanceStatus!="cancelled"`, "")
		if err != nil {
			return nil, err
		}
		for _, row := range roster {
			studentIDs = append(studentIDs, relationID(row["studentId"]))
		}
	}
	items, err := renewalCandidates(app, uniqueIDs(studentIDs), now)
	if err != nil {
		return nil, err
	}
	return map[string]any{"items": items}, nil
}

// studentRenewalReminders lists unread 教务提醒 and the template the student may subscribe to.
func studentRenewalReminders(app core.App, wechat *RenewalWechat, studentID string) (any, error) {
	rows, err := app.FindRecordsByFilter("renewal_reminders", `studentId={:id} && readAt=""`, "-created",
		renewalUnreadLimit, 0, dbx.Params{"id": studentID})
	if err != nil {
		return nil, err
	}
	items := make([]any, len(rows))
	for i, row := range rows {
		var validUntil any
		if at := row.GetDateTime("validUntil"); !at.IsZero() {
			validUntil = iso(at.Time())
		}
		items[i] = map[string]any{
			"id": row.Id, "sender": renewalSender, "message": row.GetString("message"),
			"remainingLessons": row.GetFloat("remainingLessons"), "validUntil": validUntil,
			"created": iso(row.GetDateTime("created").Time()),
		}
	}
	return map[string]any{"items": items, "subscribeTemplateId": wechat.TemplateID()}, nil
}

func readRenewalReminders(app core.App, studentID string, now time.Time) (map[string]any, error) {
	rows, err := app.FindRecordsByFilter("renewal_reminders", `studentId={:id} && readAt=""`, "", 0, 0, dbx.Params{"id": studentID})
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		row.Set("readAt", iso(now))
		if err := app.Save(row); err != nil {
			return nil, err
		}
	}
	return map[string]any{"read": len(rows)}, nil
}

// subscribeRenewals records one accepted subscribe grant for the WeChat identity in the session.
func subscribeRenewals(app core.App, studentID, openID string) (map[string]any, error) {
	if openID == "" {
		return nil, Fail("RENEWAL_WECHAT_REQUIRED", "请使用微信登录后再开启续费提醒", nil)
	}
	credits := 0
	err := app.RunInTransaction(func(tx core.App) error {
		record, err := tx.FindFirstRecordByFilter("renewal_subscriptions", "studentId={:id}", dbx.Params{"id": studentID})
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		if err != nil {
			collection, findErr := tx.FindCollectionByNameOrId("renewal_subscriptions")
			if findErr != nil {
				return findErr
			}
			record = core.NewRecord(collection)
			record.Set("studentId", studentID)
		}
		if record.GetString("openId") != openID {
			record.Set("credits", 0) // grants belong to the identity that gave them
		}
		credits = min(record.GetInt("credits")+1, renewalSubscribeCap)
		record.Set("openId", openID)
		record.Set("credits", credits)
		return tx.Save(record)
	})
	if err != nil {
		return nil, err
	}
	return map[string]any{"credits": credits}, nil
}
