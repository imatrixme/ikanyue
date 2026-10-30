// Package devseed is `seed local`: the fixtures a native development stack needs
// (admin, teacher, students, a course with booking policy and credits, rewards,
// an activity and online offers). It writes straight into the local data
// directory, refuses production, and is safe to re-run.
package devseed

import (
	"crypto/md5"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/spf13/cobra"

	"kanyue.server/internal/jsx"
	"kanyue.server/internal/tenancy"
)

const lessonQuantity = 10

type student struct {
	id, cellphone, name string
	balance             int
}

var (
	students = []student{
		{"localstudent001", "13800000001", "本地学员一", 120},
		{"localstudent002", "13800000002", "本地学员二", 40},
	}
	// Earlier managed fixtures; their students and points are removed on every run.
	managedCellphones = []string{"13900009991", "13900009992"}
	rewards           = []map[string]any{
		{"id": "localreward0001", "name": "贴纸", "description": "本地测试实物", "pointsPrice": 50, "sortOrder": 10, "status": "active"},
		{"id": "localreward0002", "name": "练习册", "description": "本地测试实物", "pointsPrice": 200, "sortOrder": 20, "status": "active"},
		{"id": "localreward0003", "name": "下线徽章", "description": "本地测试下线实物", "pointsPrice": 10, "sortOrder": 30, "status": "inactive"},
	}
	course = map[string]any{"code": "VOCAL-ADULT-1V1-60", "name": "成人声乐一对一 60 分钟", "deliveryMode": "one_to_one",
		"durationMinutes": 60, "teacherTier": "local", "status": "active"}
	creditType = map[string]any{"code": "VOCAL-ADULT-1V1-60-CREDIT", "name": "成人声乐一对一课时", "kind": "course",
		"consumable": true, "unitLabel": "lesson", "referenceUnitValue": 300, "status": "active"}
	policy = map[string]any{"code": "LOCAL-DEFAULT", "name": "本地默认预约策略", "timezone": "Asia/Shanghai",
		"defaultWindows":  []map[string]any{{"startMinute": 9 * 60, "endMinute": 12 * 60}, {"startMinute": 14 * 60, "endMinute": 20 * 60}},
		"slotStepMinutes": 30, "claimGranularityMinutes": 15, "minLeadMinutes": 60, "maxAdvanceDays": 30,
		"responseTtlMinutes": 24 * 60, "responseCutoffMinutes": 60, "cancellationCutoffMinutes": 60,
		"version": 1, "effectiveFrom": "2020-01-01T00:00:00.000Z", "status": "active"}
	teacher = map[string]any{"id": "localteacher001", "sn": "localteacher001", "username": "localteacher",
		"email": "teacher@local.com", "cellphone": "13800000000",
		"courseCreditCapabilities": []string{"course_credit.teacher"}}
)

// Options are read from the environment native-stack writes.
type Options struct {
	Production                       bool
	StudentPassword, TeacherPassword string
	AdminEmail, AdminCellphone       string
	Now                              time.Time
}

func OptionsFromEnv(env func(string) string) (Options, error) {
	options := Options{Production: env("NODE_ENV") == "production", StudentPassword: env("LOCAL_STUDENT_PASSWORD"),
		TeacherPassword: env("LOCAL_TEACHER_PASSWORD"), AdminEmail: env("OPS_BOOTSTRAP_ADMIN_EMAIL"),
		AdminCellphone: env("OPS_BOOTSTRAP_ADMIN_CELLPHONE"), Now: time.Now()}
	if options.Production || !slices.Contains([]string{"1", "true", "yes", "on"}, strings.ToLower(strings.TrimSpace(env("KANYUE_LOCAL_SEED")))) {
		return options, errors.New("seed local needs KANYUE_LOCAL_SEED=true outside production")
	}
	for name, value := range map[string]string{"LOCAL_STUDENT_PASSWORD": options.StudentPassword,
		"LOCAL_TEACHER_PASSWORD": options.TeacherPassword, "OPS_BOOTSTRAP_ADMIN_EMAIL": options.AdminEmail,
		"OPS_BOOTSTRAP_ADMIN_CELLPHONE": options.AdminCellphone} {
		if value == "" {
			return options, fmt.Errorf("%s is required for seed local", name)
		}
	}
	return options, nil
}

func Command(app core.App, env func(string) string) *cobra.Command {
	return &cobra.Command{
		Use:       "seed local",
		Short:     "Write local development fixtures (refuses production)",
		ValidArgs: []string{"local"},
		Args:      cobra.MatchAll(cobra.ExactArgs(1), cobra.OnlyValidArgs),
		RunE: func(cmd *cobra.Command, args []string) error {
			options, err := OptionsFromEnv(env)
			if err != nil {
				return err
			}
			if err := app.RunInTransaction(func(tx core.App) error { return Local(tx, options) }); err != nil {
				return err
			}
			cmd.Println("Local fixtures ready: admin, localteacher, 2 students, 1 course, offers, rewards and 1 activity.")
			return nil
		},
	}
}

// Local writes every fixture; run it inside one transaction.
// Fixtures belong to the default tenant.
func Local(app core.App, options Options) error {
	if options.Production {
		return errors.New("seed local refuses production")
	}
	app = tenancy.Scope(app, tenancy.DefaultID)
	if err := seedAdmin(app, options); err != nil {
		return err
	}
	if err := seedPoints(app, options); err != nil {
		return err
	}
	creditTypeID, err := seedBooking(app, options)
	if err != nil {
		return err
	}
	return seedCommerce(app, creditTypeID)
}

// seedAdmin creates the ops administrator once; local admin and teacher share one password.
func seedAdmin(app core.App, options Options) error {
	admin, err := app.FindFirstRecordByFilter("teachers", "username = 'admin'")
	if errors.Is(err, sql.ErrNoRows) {
		collection, err := app.FindCollectionByNameOrId("teachers")
		if err != nil {
			return err
		}
		admin = core.NewRecord(collection)
		admin.Load(map[string]any{"id": "opslocaladmin01", "sn": "opslocaladmin01", "username": "admin",
			"email": options.AdminEmail, "emailVisibility": false, "cellphone": options.AdminCellphone,
			"nickName": "本地管理员", "realName": "本地管理员", "blocked": false, "verified": true,
			"idAdmin": true, "isAdmin": true})
	} else if err != nil {
		return err
	}
	admin.SetPassword(options.TeacherPassword)
	admin.Set("opsPasswordChangeRequired", false)
	return app.Save(admin)
}

func seedPoints(app core.App, options Options) error {
	for _, cellphone := range managedCellphones {
		records, err := app.FindAllRecords("students", dbx.HashExp{"cellphone": cellphone})
		if err != nil {
			return err
		}
		for _, record := range records {
			if err := deleteWhere(app, "point_events", dbx.HashExp{"studentId": record.Id}); err != nil {
				return err
			}
			if err := deleteWhere(app, "student_points", dbx.HashExp{"studentId": record.Id}); err != nil {
				return err
			}
			if err := app.Delete(record); err != nil {
				return err
			}
		}
	}
	password := md5.Sum([]byte(options.StudentPassword))
	for _, item := range students {
		if _, err := upsertByID(app, "students", item.id, map[string]any{"sn": item.id, "cellphone": item.cellphone,
			"password": hex.EncodeToString(password[:]), "tokenKey": "token-" + item.id, "nickName": item.name,
			"realName": item.name, "blocked": false, "gender": 0}); err != nil {
			return err
		}
	}
	for _, reward := range rewards {
		if _, err := upsertByID(app, "reward_items", reward["id"].(string), without(reward, "id")); err != nil {
			return err
		}
	}
	china := time.FixedZone("Asia/Shanghai", 8*3600)
	tomorrow := options.Now.In(china).AddDate(0, 0, 1)
	start := time.Date(tomorrow.Year(), tomorrow.Month(), tomorrow.Day(), 10, 0, 0, 0, china)
	if _, err := upsertByID(app, "activities", "localactivity01", map[string]any{
		"title":       "声乐体验与声音评估",
		"description": "<p>面向希望了解科学发声与声乐训练方式的学习者，本次活动将通过基础声音评估、呼吸与共鸣练习，帮助参与者认识当前声音状态，并获得适合自身阶段的训练建议。</p><p>活动适合儿童、青少年及成人初学者参加，无需声乐基础。老师会结合年龄、声音条件与学习目标进行现场指导，具体训练内容以实际评估为准。</p>",
		"startTime":   jsx.ISO(start), "endTime": jsx.ISO(start.Add(90 * time.Minute)), "location": "看乐艺术教室",
		"price": 0, "externalLink": "", "tags": "声乐,体验", "sequence": 10, "maxParticipants": 20,
		"currentParticipants": 0, "status": "active", "type": "experience", "creator": "local-seed",
	}); err != nil {
		return err
	}
	for _, item := range students {
		if err := deleteWhere(app, "point_events", dbx.HashExp{"studentId": item.id}); err != nil {
			return err
		}
		if _, err := upsertByFilter(app, "student_points", dbx.HashExp{"studentId": item.id},
			map[string]any{"studentId": item.id, "balance": item.balance}); err != nil {
			return err
		}
		if _, err := create(app, "point_events", map[string]any{"studentId": item.id, "type": "earn",
			"delta": item.balance, "balanceAfter": item.balance, "operatorId": "local-seed", "operatorRole": "admin",
			"reason": "local_seed", "remark": "本地测试基线", "rewardItemId": ""}); err != nil {
			return err
		}
	}
	return nil
}

// seedBooking gives every unblocked student 10 lessons of one bookable course with localteacher.
func seedBooking(app core.App, options Options) (string, error) {
	local, err := app.FindFirstRecordByFilter("teachers", "cellphone = {:cellphone}",
		dbx.Params{"cellphone": teacher["cellphone"]})
	if errors.Is(err, sql.ErrNoRows) {
		collection, err := app.FindCollectionByNameOrId("teachers")
		if err != nil {
			return "", err
		}
		local = core.NewRecord(collection)
		local.Load(teacher)
		local.Set("emailVisibility", false)
		for _, key := range []string{"nickName", "nickname", "realName", "realname"} {
			local.Set(key, "本地测试老师")
		}
	} else if err != nil {
		return "", err
	}
	local.Load(map[string]any{"blocked": false, "verified": true, "idAdmin": false, "isAdmin": false,
		"courseCreditCapabilities": teacher["courseCreditCapabilities"]})
	local.SetPassword(options.TeacherPassword)
	if err := app.Save(local); err != nil {
		return "", err
	}

	spec, err := upsertByFilter(app, "course_specs", dbx.HashExp{"code": course["code"]}, course)
	if err != nil {
		return "", err
	}
	credit, err := upsertByFilter(app, "credit_types", dbx.HashExp{"code": creditType["code"]},
		with(creditType, "courseSpecId", spec.Id))
	if err != nil {
		return "", err
	}
	spec.Set("defaultCreditTypeId", credit.Id)
	if err := app.Save(spec); err != nil {
		return "", err
	}
	bookingPolicy, err := upsertByFilter(app, "booking_policies", dbx.HashExp{"code": policy["code"]}, policy)
	if err != nil {
		return "", err
	}
	if _, err := upsertByFilter(app, "teacher_credit_rules", dbx.HashExp{"courseSpecId": spec.Id, "role": "lead", "version": 1},
		map[string]any{"courseSpecId": spec.Id, "role": "lead", "baseQuantity": 1, "durationFactor": 0,
			"participantFactor": 0, "cancellationCompensation": nil, "validFrom": policy["effectiveFrom"],
			"version": 1, "status": "active"}); err != nil {
		return "", err
	}
	offering := map[string]any{"teacherId": local.Id, "courseSpecId": spec.Id, "creditTypeId": credit.Id,
		"policyId": bookingPolicy.Id, "location": "看乐艺术教室", "availabilityMode": "default", "status": "active"}
	offerings, err := app.FindRecordsByFilter("teacher_course_offerings", "teacherId = {:teacher} && courseSpecId = {:course}",
		"-version", 0, 0, dbx.Params{"teacher": local.Id, "course": spec.Id})
	if err != nil {
		return "", err
	}
	var active *core.Record
	highest := 0
	for _, record := range offerings {
		highest = max(highest, record.GetInt("version"))
		if active == nil && record.GetString("status") == "active" {
			active = record
		}
	}
	if active != nil {
		active.Load(offering)
		err = app.Save(active)
	} else {
		_, err = create(app, "teacher_course_offerings", with(offering, "version", highest+1))
	}
	if err != nil {
		return "", err
	}

	learners, err := app.FindRecordsByFilter("students", "blocked = false", "id", 0, 0)
	if err != nil {
		return "", err
	}
	for _, learner := range learners {
		if err := grantLessons(app, learner.Id, credit.Id, options.Now); err != nil {
			return "", err
		}
	}
	return credit.Id, nil
}

func grantLessons(app core.App, studentID, creditTypeID string, now time.Time) error {
	key := studentID + ":" + creditTypeID
	operationID, batchID, eventID := localID("op", key), localID("bt", key), localID("ev", key)
	expires := jsx.ISO(now.Add(365 * 24 * time.Hour))
	snapshot := map[string]any{"availableQuantity": lessonQuantity, "frozenQuantity": 0, "consumedQuantity": 0,
		"expiredQuantity": 0, "reversedQuantity": 0}
	records := []struct {
		collection string
		data       map[string]any
	}{
		{"credit_operations", map[string]any{"id": operationID, "operationNo": "local-booking-grant-" + studentID,
			"studentId": studentID, "type": "grant", "status": "committed", "idempotencyKey": "local-booking-grant-" + studentID,
			"sourceType": "local_seed", "sourceId": course["code"],
			"requestSnapshot": map[string]any{"creditTypeId": creditTypeID, "quantity": lessonQuantity},
			"resultSnapshot":  map[string]any{"batchId": batchID, "quantity": lessonQuantity},
			"actorId":         "local-seed", "actorRole": "service", "reason": "local_booking_seed", "outcome": "committed",
			"beforeSummary": map[string]any{"availableQuantity": 0}, "afterSummary": snapshot}},
		{"credit_batches", merge(snapshot, map[string]any{"id": batchID, "studentId": studentID, "creditTypeId": creditTypeID,
			"sourceOperationId": operationID, "originalQuantity": lessonQuantity, "status": "active",
			"validFrom": jsx.ISO(now.Add(-24 * time.Hour)), "originalExpiresAt": expires, "effectiveExpiresAt": expires,
			"activationMode": "GRANT_TIME", "expiryPolicy": "FIXED_DURATION", "activatedAt": jsx.ISO(now),
			"validityDurationDays": 365, "grantSnapshot": map[string]any{"source": "local_seed", "courseCode": course["code"]},
			"listUnitValue": 300, "paidUnitCost": 0, "currency": "CNY", "priority": 100, "version": 1})},
		{"credit_events", map[string]any{"id": eventID, "operationId": operationID, "batchId": batchID, "studentId": studentID,
			"creditTypeId": creditTypeID, "eventType": "GRANT", "quantityDelta": lessonQuantity, "bucketFrom": "",
			"bucketTo": "availableQuantity", "balanceSnapshot": snapshot, "businessTime": jsx.ISO(now),
			"actorId": "local-seed", "reason": "local_booking_seed", "metadata": map[string]any{"courseCode": course["code"]}}},
	}
	for _, record := range records {
		if err := createMissing(app, record.collection, record.data); err != nil {
			return err
		}
	}
	return nil
}

// seedCommerce publishes a single lesson and a 4-lesson pack, then an offer for every priced active package.
func seedCommerce(app core.App, creditTypeID string) error {
	credit, err := app.FindRecordById("credit_types", creditTypeID)
	if err != nil {
		return err
	}
	for _, quantity := range []int{1, 4} {
		packageID := contentID("local-package", quantity)
		name := credit.GetString("name") + " · 4节课包"
		sale := 800
		if quantity == 1 {
			name, sale = credit.GetString("name")+" · 单节体验", 240
		}
		for _, record := range []struct {
			collection string
			data       map[string]any
		}{
			{"packages", map[string]any{"id": packageID, "code": fmt.Sprintf("LOCAL-ONLINE-%d", quantity), "name": name,
				"description": "本地模拟购买课程", "saleChannel": "all", "activationMode": "GRANT_TIME",
				"validityDurationDays": 180, "expiryPolicy": "FIXED_DURATION", "status": "active"}},
			{"package_grant_lines", map[string]any{"id": contentID("local-line", quantity), "packageId": packageID,
				"creditTypeId": credit.Id, "quantity": quantity}},
			{"price_versions", map[string]any{"id": contentID("local-price", quantity), "packageId": packageID,
				"currency": "CNY", "listAmount": quantity * 240, "saleAmount": sale,
				"validFrom": "2020-01-01T00:00:00.000Z", "version": 1, "status": "active"}},
		} {
			if err := createMissing(app, record.collection, record.data); err != nil {
				return err
			}
		}
	}
	packages, err := app.FindAllRecords("packages", dbx.HashExp{"status": "active"})
	if err != nil {
		return err
	}
	for _, item := range packages {
		prices, err := app.FindRecordsByFilter("price_versions", "packageId = {:id} && status = 'active'", "-validFrom", 1, 0,
			dbx.Params{"id": item.Id})
		if err != nil {
			return err
		}
		if len(prices) == 0 || prices[0].GetFloat("saleAmount") <= 0 {
			continue
		}
		item.Set("saleChannel", "all")
		if err := app.Save(item); err != nil {
			return err
		}
		if err := createMissing(app, "commerce_offers", map[string]any{"id": contentID("local-offer", item.Id),
			"packageId": item.Id, "priceVersionId": prices[0].Id, "name": item.GetString("name"), "status": "active",
			"policy": map[string]any{"version": 1, "packageRefund": "unused_paid_value",
				"cancellationTiers": []map[string]any{{"beforeMinutes": 0, "feeBps": 0}}, "testOnly": true}}); err != nil {
			return err
		}
	}
	return nil
}

// localID matches the old seed: prefix + sha256(value), cut to a 15-char record id.
func localID(prefix, value string) string {
	sum := sha256.Sum256([]byte(value))
	return (prefix + hex.EncodeToString(sum[:]))[:15]
}

// contentID is sha256(JSON(parts))[:15], the commerce planning id, so re-runs find earlier records.
func contentID(parts ...any) string {
	raw, _ := json.Marshal(parts)
	sum := sha256.Sum256(raw)
	return hex.EncodeToString(sum[:])[:15]
}

func create(app core.App, name string, data map[string]any) (*core.Record, error) {
	collection, err := app.FindCollectionByNameOrId(name)
	if err != nil {
		return nil, err
	}
	record := core.NewRecord(collection)
	record.Load(data)
	return record, app.Save(record)
}

func createMissing(app core.App, name string, data map[string]any) error {
	_, err := app.FindRecordById(name, data["id"].(string))
	if errors.Is(err, sql.ErrNoRows) {
		_, err = create(app, name, data)
	}
	return err
}

func upsertByID(app core.App, name, id string, data map[string]any) (*core.Record, error) {
	record, err := app.FindRecordById(name, id)
	if errors.Is(err, sql.ErrNoRows) {
		return create(app, name, with(data, "id", id))
	}
	if err != nil {
		return nil, err
	}
	record.Load(data)
	return record, app.Save(record)
}

func upsertByFilter(app core.App, name string, where dbx.HashExp, data map[string]any) (*core.Record, error) {
	records, err := app.FindAllRecords(name, where)
	if err != nil {
		return nil, err
	}
	if len(records) == 0 {
		return create(app, name, data)
	}
	records[0].Load(data)
	return records[0], app.Save(records[0])
}

func deleteWhere(app core.App, name string, where dbx.HashExp) error {
	records, err := app.FindAllRecords(name, where)
	if err != nil {
		return err
	}
	for _, record := range records {
		if err := app.Delete(record); err != nil {
			return err
		}
	}
	return nil
}

func merge(base, extra map[string]any) map[string]any {
	result := make(map[string]any, len(base)+len(extra))
	for key, value := range base {
		result[key] = value
	}
	for key, value := range extra {
		result[key] = value
	}
	return result
}

func with(base map[string]any, key string, value any) map[string]any {
	return merge(base, map[string]any{key: value})
}

func without(base map[string]any, key string) map[string]any {
	result := merge(base, nil)
	delete(result, key)
	return result
}
