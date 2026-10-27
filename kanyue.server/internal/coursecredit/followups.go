package coursecredit

import (
	"slices"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/ids"
	"kanyue.server/internal/jsx"
	"kanyue.server/internal/records"
)

// followUpAction marks renewal follow-ups, which live in ops_audit_logs.
const followUpAction = "course_operations.students.follow_up"

const maxFollowUpNote = 300

func recordFollowUp(app core.App, studentID string, input Body, actor Actor, now time.Time) (map[string]any, error) {
	if studentID == "" {
		return nil, Fail("STUDENT_ID_REQUIRED", "请选择学员", nil)
	}
	status, _ := input.Values["status"].(string)
	if status != "contacted" && status != "declined" {
		return nil, Fail("FOLLOW_UP_STATUS_INVALID", "跟进结果无效", nil)
	}
	snoozeUntil, ok := time.Time{}, false
	if raw := input.Get("snoozeUntil"); jsx.Truthy(raw) {
		snoozeUntil, ok = jsx.DateParse(raw)
	}
	if !ok || !snoozeUntil.Truncate(time.Millisecond).After(now) {
		return nil, Fail("FOLLOW_UP_SNOOZE_INVALID", "下次提醒日期必须晚于现在", nil)
	}
	if _, err := app.FindRecordById("students", studentID); err != nil {
		return nil, err
	}
	note := ""
	if text, ok := input.Values["note"].(string); ok {
		note = jsx.Slice(strings.TrimSpace(text), maxFollowUpNote)
	}
	role := "teacher"
	if actor.Role == "admin" {
		role = "admin"
	}
	metadata := map[string]any{"status": status, "note": note, "snoozeUntil": jsx.ISO(snoozeUntil)}
	id := ids.Record()
	err := app.RunInTransaction(func(tx core.App) error {
		collection, err := tx.FindCollectionByNameOrId("ops_audit_logs")
		if err != nil {
			return err
		}
		row := core.NewRecord(collection)
		row.Id = id
		records.SetKnown(row, map[string]any{
			"actorId": actor.ID, "actorRole": role, "action": followUpAction, "resourceType": "students",
			"resourceId": studentID, "outcome": "success", "metadata": metadata,
		})
		return tx.Save(row)
	})
	if err != nil {
		return nil, batchFailed(err)
	}
	return map[string]any{
		"id": id, "studentId": studentID, "status": status, "note": note, "snoozeUntil": metadata["snoozeUntil"],
		"actorId": actor.ID, "created": jsx.ISO(now),
	}, nil
}

func listFollowUps(app core.App, studentIDs []string) ([]map[string]any, error) {
	wanted := uniqueIDs(studentIDs)
	if len(wanted) == 0 {
		return []map[string]any{}, nil
	}
	rows, err := app.FindRecordsByFilter("ops_audit_logs",
		`action="`+followUpAction+`" && `+anyFilter("resourceId", wanted), "-created", 0, 0)
	if err != nil {
		return nil, err
	}
	items := make([]map[string]any, 0, len(rows))
	for _, record := range rows {
		row := records.JSON(record)
		metadata, _ := row["metadata"].(map[string]any)
		items = append(items, map[string]any{
			"id":          row["id"],
			"studentId":   row["resourceId"],
			"status":      or(metadata["status"], "contacted"),
			"note":        or(metadata["note"], ""),
			"snoozeUntil": or(metadata["snoozeUntil"], nil),
			"actorId":     relationID(row["actorId"]),
			"created":     or(row["created"], nil),
		})
	}
	return items, nil
}

func uniqueIDs(values []string) []string {
	result := []string{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" && !slices.Contains(result, value) {
			result = append(result, value)
		}
	}
	return result
}

func anyFilter(field string, values []string) string {
	parts := make([]string, len(values))
	for i, value := range values {
		parts[i] = field + `="` + records.EscapeFilter(value) + `"`
	}
	return "(" + strings.Join(parts, " || ") + ")"
}

// or is JavaScript `value || fallback`.
func or(value, fallback any) any {
	if jsx.Truthy(value) {
		return value
	}
	return fallback
}
