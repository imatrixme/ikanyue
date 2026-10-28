package migrations

import (
	"database/sql"
	"errors"

	"github.com/pocketbase/pocketbase/core"
)

// EnsureRenewalReminders adds the renewal reminder log and the students' WeChat
// subscribe grants. Both stay superuser-only: every read goes through Go routes.
// Exported so package tests can build the collections on a testkit app.
func EnsureRenewalReminders(txApp core.App) error {
	students, err := txApp.FindCollectionByNameOrId("students")
	if err != nil {
		return err
	}
	specs, err := txApp.FindCollectionByNameOrId("course_specs")
	if err != nil {
		return err
	}
	teachers, err := txApp.FindCollectionByNameOrId("teachers")
	if err != nil {
		return err
	}

	_, err = txApp.FindCollectionByNameOrId("renewal_reminders")
	if errors.Is(err, sql.ErrNoRows) {
		reminders := core.NewBaseCollection("renewal_reminders")
		reminders.Fields.Add(
			&core.RelationField{Name: "studentId", CollectionId: students.Id, MaxSelect: 1, Required: true},
			&core.RelationField{Name: "courseSpecId", CollectionId: specs.Id, MaxSelect: 1},
			&core.SelectField{Name: "trigger", Required: true, MaxSelect: 1, Values: []string{"auto", "manual"}},
			&core.SelectField{Name: "reason", Required: true, MaxSelect: 1, Values: []string{"low_balance", "expiring", "manual"}},
			// roundKey groups automatic reminders between two grants; dedupeKey makes each
			// automatic attempt and each manual day unique, so reruns cannot double-send.
			&core.TextField{Name: "roundKey", Max: 200},
			&core.TextField{Name: "dedupeKey", Required: true, Max: 200},
			&core.NumberField{Name: "remainingLessons"},
			&core.DateField{Name: "validUntil"},
			&core.TextField{Name: "message", Max: 300},
			&core.RelationField{Name: "operatorId", CollectionId: teachers.Id, MaxSelect: 1},
			&core.SelectField{Name: "wechatStatus", Required: true, MaxSelect: 1, Values: []string{"pending", "sent", "skipped", "failed"}},
			&core.TextField{Name: "wechatError", Max: 300},
			&core.DateField{Name: "readAt"},
			&core.AutodateField{Name: "created", OnCreate: true},
			&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
		)
		reminders.AddIndex("idx_renewal_reminders_dedupe", true, "dedupeKey", "")
		reminders.AddIndex("idx_renewal_reminders_student", false, "studentId, created", "")
		if err = txApp.Save(reminders); err != nil {
			return err
		}
	} else if err != nil {
		return err
	}

	_, err = txApp.FindCollectionByNameOrId("renewal_subscriptions")
	if errors.Is(err, sql.ErrNoRows) {
		subscriptions := core.NewBaseCollection("renewal_subscriptions")
		subscriptions.Fields.Add(
			&core.RelationField{Name: "studentId", CollectionId: students.Id, MaxSelect: 1, Required: true},
			// openId is the mini program identity that granted; credits counts one-time
			// subscribe grants not yet used by a message.
			&core.TextField{Name: "openId", Required: true, Max: 128},
			&core.NumberField{Name: "credits", OnlyInt: true},
			&core.AutodateField{Name: "created", OnCreate: true},
			&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
		)
		subscriptions.AddIndex("idx_renewal_subscriptions_student", true, "studentId", "")
		return txApp.Save(subscriptions)
	}
	return err
}
