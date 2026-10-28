package points

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"slices"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/testkit"
)

type fixture struct {
	app      core.App
	handler  http.Handler
	signer   *auth.Signer
	students []*core.Record
	rewards  map[string]*core.Record
	admin    map[string]string
	teacher  map[string]string
}

func setup(t *testing.T, module Module) fixture {
	t.Helper()
	app := testkit.NewApp(t)
	students, _ := app.FindCollectionByNameOrId("students")
	accounts := core.NewBaseCollection(studentPoints)
	accounts.Fields.Add(&core.RelationField{Name: "studentId", CollectionId: students.Id, MaxSelect: 1, Required: true},
		&core.NumberField{Name: "balance"}, &core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true})
	events := core.NewBaseCollection(pointEvents)
	events.Fields.Add(&core.RelationField{Name: "studentId", CollectionId: students.Id, MaxSelect: 1, Required: true},
		&core.SelectField{Name: "type", MaxSelect: 1, Values: []string{"earn", "offline_redeem", "manual_adjust"}},
		&core.NumberField{Name: "delta"}, &core.NumberField{Name: "balanceAfter"},
		&core.TextField{Name: "operatorId"}, &core.TextField{Name: "operatorRole"}, &core.TextField{Name: "reason"},
		&core.TextField{Name: "remark"}, &core.TextField{Name: "rewardItemId"}, &core.JSONField{Name: "rewardSnapshot"},
		&core.AutodateField{Name: "created", OnCreate: true})
	rewards := core.NewBaseCollection(rewardItems)
	rewards.Fields.Add(&core.TextField{Name: "name"}, &core.TextField{Name: "description"}, &core.URLField{Name: "image"},
		&core.FileField{Name: "imageFile", MaxSelect: 1, MaxSize: maxRewardImageSize},
		&core.NumberField{Name: "pointsPrice"}, &core.NumberField{Name: "sortOrder"},
		&core.SelectField{Name: "status", MaxSelect: 1, Values: []string{"active", "inactive"}})
	for _, collection := range []*core.Collection{accounts, events, rewards} {
		if err := app.Save(collection); err != nil {
			t.Fatal(err)
		}
	}

	signer, err := auth.NewSigner(testkit.Secret)
	if err != nil {
		t.Fatal(err)
	}
	f := fixture{app: app, signer: signer, rewards: map[string]*core.Record{}}
	f.students = []*core.Record{
		testkit.Create(t, app, "students", map[string]any{"realName": "张三", "cellphone": "13800000001", "wechatId": "wx1"}),
		testkit.Create(t, app, "students", map[string]any{"realName": "李四", "cellphone": "13800000002"}),
	}
	testkit.Create(t, app, "students", map[string]any{"realName": "张停用", "blocked": true})
	testkit.Create(t, app, studentPoints, map[string]any{"studentId": f.students[0].Id, "balance": 120})
	// Autodate ignores a set created, so the seed dates are written directly.
	for _, seed := range []map[string]any{
		{"delta": 80, "balanceAfter": 80, "reason": "seed", "created": "2026-06-01 08:00:00.000Z"},
		{"delta": 40, "balanceAfter": 120, "reason": "课堂奖励", "created": "2026-06-02 08:00:00.000Z"},
	} {
		created := seed["created"]
		delete(seed, "created")
		seed["studentId"], seed["type"] = f.students[0].Id, "earn"
		event := testkit.Create(t, app, pointEvents, seed)
		if _, err := app.DB().NewQuery("UPDATE point_events SET created = {:created} WHERE id = {:id}").
			Bind(dbx.Params{"created": created, "id": event.Id}).Execute(); err != nil {
			t.Fatal(err)
		}
	}
	for _, item := range []map[string]any{
		{"name": "贴纸", "pointsPrice": 50, "sortOrder": 1, "status": "active"},
		{"name": "乐理书", "pointsPrice": 200, "sortOrder": 2, "status": "active"},
		{"name": "隐藏实物", "pointsPrice": 10, "sortOrder": 3, "status": "inactive"},
	} {
		f.rewards[item["name"].(string)] = testkit.Create(t, app, rewardItems, item)
	}

	teacher := testkit.Create(t, app, "teachers", map[string]any{"email": "teacher@example.com", "password": "admin-pass-1"})
	admin := testkit.Create(t, app, "teachers", map[string]any{"email": "admin@example.com", "password": "admin-pass-1", "isAdmin": true})
	sign := func(record *core.Record, isAdmin bool) map[string]string {
		token, _ := signer.Sign(record.Id, "T", "teacher", isAdmin, auth.Claims{"scope": auth.OpsScope}, auth.OpsTokenTTL)
		return testkit.Bearer(token)
	}
	f.teacher, f.admin = sign(teacher, false), sign(admin, true)
	module.Signer = signer
	f.handler = testkit.Serve(t, app, module.Register)
	return f
}

func (f fixture) studentToken(t *testing.T, student *core.Record) map[string]string {
	token, err := f.signer.Sign(student.Id, "S1", "student", false, nil, auth.AppTokenTTL)
	if err != nil {
		t.Fatal(err)
	}
	return testkit.Bearer(token)
}

func (f fixture) balance(t *testing.T, student *core.Record) float64 {
	account, err := findAccount(f.app, student.Id)
	if err != nil || account == nil {
		t.Fatalf("account = %v, %v", account, err)
	}
	return account.GetFloat("balance")
}

func (f fixture) lastEvent(t *testing.T) *core.Record {
	event := &core.Record{}
	if err := f.app.RecordQuery(pointEvents).OrderBy("rowid DESC").Limit(1).One(event); err != nil {
		t.Fatal(err)
	}
	return event
}

func ids(t *testing.T, value any) []string {
	t.Helper()
	items, _ := value.([]any)
	result := []string{}
	for _, item := range items {
		result = append(result, item.(map[string]any)["id"].(string))
	}
	return result
}

func audited(t *testing.T, app core.App, action string) bool {
	logs, err := app.FindRecordsByFilter("ops_audit_logs", "action = {:action}", "", 0, 0, map[string]any{"action": action})
	return err == nil && len(logs) > 0
}

// Hono: pointsLite › student points endpoint returns balance and event history for the logged-in learner
func TestStudentSummary(t *testing.T) {
	f := setup(t, Module{})
	data := testkit.Call(t, f.handler, http.MethodGet, "/v1/points/me", nil, f.studentToken(t, f.students[0])).Data()
	events, _ := data["events"].([]any)
	pagination, _ := data["pagination"].(map[string]any)
	if data["studentId"] != f.students[0].Id || data["balance"] != float64(120) || len(events) != 2 || pagination["totalItems"] != float64(2) {
		t.Fatalf("summary = %v", data)
	}
	if events[0].(map[string]any)["reason"] != "课堂奖励" {
		t.Fatalf("events not newest first: %v", events)
	}
}

// Hono: pointsLite › student reward list separates redeemable and locked active items
func TestStudentRewardAvailability(t *testing.T) {
	f := setup(t, Module{})
	data := testkit.Call(t, f.handler, http.MethodGet, "/v1/reward-items", nil, f.studentToken(t, f.students[0])).Data()
	if data["currentPoints"] != float64(120) ||
		!slices.Equal(ids(t, data["redeemableItems"]), []string{f.rewards["贴纸"].Id}) ||
		!slices.Equal(ids(t, data["lockedItems"]), []string{f.rewards["乐理书"].Id}) {
		t.Fatalf("availability = %v", data)
	}
	first := data["redeemableItems"].([]any)[0].(map[string]any)
	if len(first) != 5 || first["image"] != "" || first["description"] != "" {
		t.Fatalf("public reward = %v", first)
	}
}

// Hono: pointsLiteCoverage › points handlers reject non-students and convert service failures to standard errors
// Hono: pointsLiteCoverage › student auth middleware covers token header, raw bearer, invalid, and expired paths
func TestStudentRoutesRequireAStudent(t *testing.T) {
	f := setup(t, Module{})
	for _, url := range []string{"/v1/points/me", "/v1/reward-items"} {
		if denied := testkit.Call(t, f.handler, http.MethodGet, url, nil, f.teacher); denied.Code() != 403 || denied.Body["message"] != "仅学员可访问积分" {
			t.Fatalf("%s teacher = %v", url, denied.Body)
		}
		if anonymous := testkit.Call(t, f.handler, http.MethodGet, url, nil, nil); anonymous.Body["message"] != "未授权，请登录后操作" {
			t.Fatalf("%s anonymous = %v", url, anonymous.Body)
		}
	}
}

// Hono: pointsLite › admin can add points while teacher and invalid inputs are rejected
func TestOpsBalancesAndEarn(t *testing.T) {
	f := setup(t, Module{})
	zhang, li := f.students[0], f.students[1]

	students := testkit.Call(t, f.handler, http.MethodGet, "/ops/points/students?q=张", nil, f.teacher).Data()
	items, _ := students["items"].([]any)
	if !slices.Equal(ids(t, items), []string{zhang.Id}) || items[0].(map[string]any)["balance"] != float64(120) {
		t.Fatalf("keyword list = %v", students)
	}
	if _, leaked := items[0].(map[string]any)["wechatId"]; leaked {
		t.Fatalf("projection leaked: %v", items[0])
	}
	all := testkit.Call(t, f.handler, http.MethodGet, "/ops/points/students?perPage=2", nil, f.admin).Data()
	for _, item := range all["items"].([]any) {
		if row := item.(map[string]any); row["id"] == li.Id && row["balance"] != float64(0) {
			t.Fatalf("missing account balance = %v", row)
		}
	}
	if keyword := testkit.Call(t, f.handler, http.MethodGet, "/ops/points/students?keyword=李&limit=1", nil, f.admin).Data(); !slices.Equal(ids(t, keyword["items"]), []string{li.Id}) {
		t.Fatalf("keyword fallback = %v", keyword)
	}
	if blank := testkit.Call(t, f.handler, http.MethodGet, "/ops/points/students?q=%20&keyword=李", nil, f.admin).Data(); len(blank["items"].([]any)) != 2 {
		t.Fatalf("a blank q still wins over keyword: %v", blank)
	}
	if summary := testkit.Call(t, f.handler, http.MethodGet, "/ops/points/students/"+zhang.Id, nil, f.teacher).Data(); summary["balance"] != float64(120) {
		t.Fatalf("summary = %v", summary)
	}

	if denied := testkit.Call(t, f.handler, http.MethodPost, "/ops/points/students/"+zhang.Id+"/earn", map[string]any{"amount": 30}, f.teacher); denied.Code() != 403 || denied.Body["message"] != "需要管理员权限" {
		t.Fatalf("teacher earn = %v", denied.Body)
	}
	for _, amount := range []any{0, -1, 1.5, "abc", nil} {
		if invalid := testkit.Call(t, f.handler, http.MethodPost, "/ops/points/students/"+zhang.Id+"/earn", map[string]any{"amount": amount}, f.admin); invalid.Code() != 400 || invalid.Body["message"] != "积分必须为正整数" {
			t.Fatalf("amount %v = %v", amount, invalid.Body)
		}
	}
	if f.balance(t, zhang) != 120 {
		t.Fatal("rejected earn changed the balance")
	}

	added := testkit.Call(t, f.handler, http.MethodPost, "/ops/points/students/"+zhang.Id+"/earn",
		map[string]any{"amount": 35, "reason": "课堂奖励", "remark": "节奏稳定"}, f.admin).Data()
	if added["balance"] != float64(155) || f.balance(t, zhang) != 155 {
		t.Fatalf("earn = %v", added)
	}
	event := f.lastEvent(t)
	if event.GetString("type") != "earn" || event.GetFloat("delta") != 35 || event.GetFloat("balanceAfter") != 155 ||
		event.GetString("operatorRole") != "teacher" || event.GetString("remark") != "节奏稳定" || event.GetString("rewardSnapshot") != "null" {
		t.Fatalf("event = %v", event.FieldsData())
	}
	if !audited(t, f.app, "ops.points.add") {
		t.Fatal("earn was not audited")
	}

	// Hono: pointsLiteCoverage › point service covers missing accounts, defaults, direct negative delta, and no-audit mode
	testkit.Call(t, f.handler, http.MethodPost, "/ops/points/students/"+li.Id+"/earn", map[string]any{"amount": "5"}, f.admin)
	if f.balance(t, li) != 5 || f.lastEvent(t).GetString("reason") != "admin_grant" {
		t.Fatalf("default reason event = %v", f.lastEvent(t).FieldsData())
	}
	paged := testkit.Call(t, f.handler, http.MethodGet, "/ops/points/students/"+li.Id+"/events?page=bad&perPage=bad", nil, f.admin).Data()
	if pagination := paged["pagination"].(map[string]any); pagination["page"] != float64(1) || pagination["perPage"] != float64(20) {
		t.Fatalf("pagination = %v", paged)
	}
}

// Hono: pointsLite › lite admin point routes return business errors for missing resource params
func TestMissingResourceParams(t *testing.T) {
	f := setup(t, Module{})
	checks := []struct {
		url     string
		body    map[string]any
		code    int
		message string
	}{
		{"/ops/points/students/%20/earn", map[string]any{"amount": 10}, 400, "学员不能为空"},
		{"/ops/reward-items/%20", map[string]any{"name": "空", "pointsPrice": 1}, 400, "实物不能为空"},
		{"/ops/reward-items/missing", map[string]any{"name": "空", "pointsPrice": 1}, 404, "The requested resource wasn't found."},
		{"/ops/points/offline-redeem", map[string]any{"itemId": f.rewards["贴纸"].Id}, 400, "学员不能为空"},
		{"/ops/points/offline-redeem", map[string]any{"studentId": f.students[0].Id}, 400, "实物不能为空"},
		{"/ops/points/offline-redeem", map[string]any{"studentId": f.students[0].Id, "itemId": "missing"}, 404, "The requested resource wasn't found."},
	}
	for _, check := range checks {
		response := testkit.Call(t, f.handler, http.MethodPost, check.url, check.body, f.admin)
		if response.Code() != check.code || response.Body["message"] != check.message {
			t.Fatalf("%s %v = %v", check.url, check.body, response.Body)
		}
	}
	if missing := testkit.Call(t, f.handler, http.MethodGet, "/ops/points/students/%20", nil, f.admin); missing.Code() != 400 || missing.Body["message"] != "学员不能为空" {
		t.Fatalf("blank summary = %v", missing.Body)
	}
}

// Hono: pointsLite › offline redemption deducts stored item price and rejects unavailable exchanges
// Hono: pointsLiteCoverage › reward service covers invalid ids, inactive and invalid active rewards, and public defaults
func TestOfflineRedeem(t *testing.T) {
	f := setup(t, Module{})
	zhang := f.students[0]
	free := testkit.Create(t, f.app, rewardItems, map[string]any{"name": "无效", "pointsPrice": 0, "status": "active"})

	if events := testkit.Call(t, f.handler, http.MethodGet, "/ops/points/students/"+zhang.Id+"/events", nil, f.admin).Data(); len(events["events"].([]any)) != 2 {
		t.Fatalf("events = %v", events)
	}
	if denied := testkit.Call(t, f.handler, http.MethodPost, "/ops/points/offline-redeem",
		map[string]any{"studentId": zhang.Id, "itemId": f.rewards["贴纸"].Id}, f.teacher); denied.Code() != 403 {
		t.Fatalf("teacher redeem = %v", denied.Body)
	}

	redeemed := testkit.Call(t, f.handler, http.MethodPost, "/ops/points/offline-redeem",
		map[string]any{"studentId": zhang.Id, "itemId": f.rewards["贴纸"].Id, "amount": 1, "remark": "已线下领取"}, f.admin).Data()
	reward, _ := redeemed["reward"].(map[string]any)
	if redeemed["balance"] != float64(70) || reward["pointsPrice"] != float64(50) || f.balance(t, zhang) != 70 {
		t.Fatalf("redeem = %v", redeemed)
	}
	event := f.lastEvent(t)
	var snapshot map[string]any
	_ = json.Unmarshal([]byte(event.GetString("rewardSnapshot")), &snapshot)
	if event.GetFloat("delta") != -50 || event.GetString("type") != "offline_redeem" || event.GetString("rewardItemId") != f.rewards["贴纸"].Id ||
		snapshot["name"] != "贴纸" || snapshot["pointsPrice"] != float64(50) || snapshot["id"] != f.rewards["贴纸"].Id {
		t.Fatalf("redeem event = %v", event.FieldsData())
	}

	for item, message := range map[string]string{
		f.rewards["乐理书"].Id:  "积分不足，无法兑换该实物",
		f.rewards["隐藏实物"].Id: "实物已下线，无法兑换",
		free.Id:              "实物积分价格无效",
	} {
		response := testkit.Call(t, f.handler, http.MethodPost, "/ops/points/offline-redeem", map[string]any{"studentId": zhang.Id, "itemId": item}, f.admin)
		if response.Code() != 400 || response.Body["message"] != message {
			t.Fatalf("%s = %v", message, response.Body)
		}
	}
	if f.balance(t, zhang) != 70 || !audited(t, f.app, "ops.points.offline_redeem") {
		t.Fatal("rejected redemptions changed the balance or the redemption was not audited")
	}
}

// applyDelta never lets a balance go negative, even when called directly.
// Hono: pointsLiteCoverage › point service covers missing accounts, defaults, direct negative delta, and no-audit mode
func TestApplyDeltaRejectsNegativeBalance(t *testing.T) {
	f := setup(t, Module{})
	event := &core.RequestEvent{App: f.app}
	event.Set("kanyueUser", auth.Claims{})
	if _, err := applyDelta(event, delta{studentID: f.students[1].Id, amount: -1, reason: "test", kind: "manual_adjust"}); err == nil || err.Error() != "积分不足" {
		t.Fatalf("negative delta = %v", err)
	}
	result, err := applyDelta(event, delta{studentID: f.students[1].Id, amount: 0, reason: "zero", kind: "manual_adjust"})
	if err != nil || result["balance"] != float64(0) || f.lastEvent(t).GetString("operatorId") != "" {
		t.Fatalf("zero delta = %v, %v", result, err)
	}
}

// Hono: pointsLite › admin manages reward item catalog for the light branch
// Hono: pointsLiteCoverage › reward service covers invalid ids, inactive and invalid active rewards, and public defaults
func TestRewardCatalog(t *testing.T) {
	f := setup(t, Module{})
	list := testkit.Call(t, f.handler, http.MethodGet, "/ops/reward-items", nil, f.admin).Data()
	if !slices.Equal(ids(t, list["items"]), []string{f.rewards["贴纸"].Id, f.rewards["乐理书"].Id, f.rewards["隐藏实物"].Id}) || list["totalItems"] != float64(3) {
		t.Fatalf("list = %v", list)
	}
	checks := []struct {
		body    map[string]any
		message string
	}{
		{map[string]any{"name": "无效实物", "pointsPrice": -1}, "实物积分价格必须为正整数"},
		{map[string]any{"name": "", "pointsPrice": 1}, "实物名称不能为空"},
		{map[string]any{"name": "  ", "title": "备用", "pointsPrice": 1}, "实物名称不能为空"},
	}
	for _, check := range checks {
		if invalid := testkit.Call(t, f.handler, http.MethodPost, "/ops/reward-items", check.body, f.admin); invalid.Code() != 400 || invalid.Body["message"] != check.message {
			t.Fatalf("%v = %v", check.body, invalid.Body)
		}
	}

	created := testkit.Call(t, f.handler, http.MethodPost, "/ops/reward-items",
		map[string]any{"name": "帆布袋", "pointsPrice": 90, "description": "线下领取", "imageUrl": "https://example.com/bag.png"}, f.admin).Data()
	if created["status"] != "active" || created["image"] != "https://example.com/bag.png" || created["description"] != "线下领取" {
		t.Fatalf("created = %v", created)
	}
	updated := testkit.Call(t, f.handler, http.MethodPost, "/ops/reward-items/"+created["id"].(string),
		map[string]any{"status": "inactive", "pointsPrice": 100}, f.admin).Data()
	if updated["status"] != "inactive" || updated["pointsPrice"] != float64(100) || updated["name"] != "帆布袋" || updated["image"] != "https://example.com/bag.png" {
		t.Fatalf("updated = %v", updated)
	}
	titled := testkit.Call(t, f.handler, http.MethodPost, "/ops/reward-items", map[string]any{"title": "徽章", "pointsPrice": 20, "status": "inactive"}, f.admin).Data()
	if titled["name"] != "徽章" || titled["status"] != "inactive" {
		t.Fatalf("titled = %v", titled)
	}

	for _, url := range []string{"/ops/reward-items", "/ops/reward-items/" + f.rewards["贴纸"].Id} {
		denied := testkit.Call(t, f.handler, http.MethodPost, url, map[string]any{"name": "越权实物", "pointsPrice": 10}, f.teacher)
		if denied.Code() != 403 || denied.Body["message"] != "需要管理员权限" {
			t.Fatalf("teacher %s = %v", url, denied.Body)
		}
	}
	if denied := testkit.Call(t, f.handler, http.MethodGet, "/ops/reward-items", nil, f.teacher); denied.Code() != 403 {
		t.Fatalf("teacher list = %v", denied.Body)
	}
}

func upload(t *testing.T, f fixture, id, field, filename, contentType string, content []byte, headers map[string]string) testkit.Response {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	if field != "" {
		header := textproto.MIMEHeader{}
		header.Set("Content-Disposition", `form-data; name="`+field+`"; filename="`+filename+`"`)
		header.Set("Content-Type", contentType)
		part, _ := writer.CreatePart(header)
		_, _ = part.Write(content)
	}
	_ = writer.Close()
	request := httptest.NewRequest(http.MethodPost, "/ops/reward-items/"+id+"/image", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	for key, value := range headers {
		request.Header.Set(key, value)
	}
	recorder := httptest.NewRecorder()
	f.handler.ServeHTTP(recorder, request)
	result := testkit.Response{Status: recorder.Code, Body: map[string]any{}}
	if err := json.Unmarshal(recorder.Body.Bytes(), &result.Body); err != nil {
		t.Fatalf("invalid JSON %q", recorder.Body.String())
	}
	return result
}

// Hono: pointsLite › admin uploads reward images and receives the public object-storage URL
// Hono: pointsLiteCoverage › reward service covers invalid ids, inactive and invalid active rewards, and public defaults
func TestRewardImageUpload(t *testing.T) {
	f := setup(t, Module{PublicAssetBaseURL: "https://assets.example.test/rewards"})
	sticker := f.rewards["贴纸"]
	png := []byte("\x89PNG\r\n\x1a\nimage-bytes")
	prefix := "https://assets.example.test/rewards/" + sticker.Collection().Id + "/" + sticker.Id + "/"
	for field, name := range map[string]string{"imageFile": "sticker", "image": "legacy", "file": "fallback"} {
		data := upload(t, f, sticker.Id, field, name+".png", "image/png", png, f.admin).Data()
		image, _ := data["image"].(string)
		if !strings.HasPrefix(image, prefix+name+"_") || !strings.HasSuffix(image, ".png") {
			t.Fatalf("%s upload = %v", field, data)
		}
	}
	stored, _ := f.app.FindRecordById(rewardItems, sticker.Id)
	if len(stored.GetStringSlice("imageFile")) != 1 {
		t.Fatalf("stored imageFile = %q", stored.GetString("imageFile"))
	}

	checks := []struct {
		id, field, contentType string
		content                []byte
		headers                map[string]string
		code                   int
		message                string
	}{
		{sticker.Id, "", "", nil, f.admin, 400, "请选择实物图片"},
		{sticker.Id, "imageFile", "image/png", []byte{}, f.admin, 400, "实物图片不能为空"},
		{sticker.Id, "imageFile", "image/png", bytes.Repeat([]byte("a"), maxRewardImageSize+1), f.admin, 400, "实物图片不能超过 5MB"},
		{sticker.Id, "imageFile", "text/plain", []byte("text"), f.admin, 400, "仅支持 JPG、PNG、WebP、GIF 或 AVIF 图片"},
		{sticker.Id, "imageFile", "image/png", png, f.teacher, 403, "需要管理员权限"},
		{"%20", "imageFile", "image/png", png, f.admin, 400, "实物不能为空"},
		{"missing", "imageFile", "image/png", png, f.admin, 404, "The requested resource wasn't found."},
	}
	for _, check := range checks {
		response := upload(t, f, check.id, check.field, "x.png", check.contentType, check.content, check.headers)
		if response.Code() != check.code || response.Body["message"] != check.message {
			t.Fatalf("%s %s = %v", check.field, check.contentType, response.Body)
		}
	}

	// Hono: pointsLiteCoverage › reward image handler converts malformed multipart requests into a business error
	malformed := testkit.Raw(t, f.handler, http.MethodPost, "/ops/reward-items/"+sticker.Id+"/image", "--x\r\nbroken", f.admin)
	if malformed.Code() != 400 {
		t.Fatalf("non-multipart body = %v", malformed.Body)
	}
	request := httptest.NewRequest(http.MethodPost, "/ops/reward-items/"+sticker.Id+"/image", strings.NewReader("--x\r\nbroken"))
	request.Header.Set("Content-Type", "multipart/form-data; boundary=x")
	for key, value := range f.teacher {
		request.Header.Set(key, value)
	}
	recorder := httptest.NewRecorder()
	f.handler.ServeHTTP(recorder, request)
	if !strings.Contains(recorder.Body.String(), "图片上传请求解析失败") {
		t.Fatalf("malformed multipart = %s", recorder.Body.String())
	}
}

// Hono: pointsLiteCoverage › reward service covers invalid ids, inactive and invalid active rewards, and public defaults
func TestRewardImageFallsBackToPocketBaseFiles(t *testing.T) {
	f := setup(t, Module{PBPublicURL: "https://pb.example.test/"})
	sticker := f.rewards["贴纸"]
	data := upload(t, f, sticker.Id, "imageFile", "photo.webp", "image/webp", []byte("RIFF....WEBPVP8 "), f.admin).Data()
	if image, _ := data["image"].(string); !strings.HasPrefix(image, "https://pb.example.test/api/files/"+sticker.Collection().Id+"/"+sticker.Id+"/photo") {
		t.Fatalf("pb file url = %v", data)
	}
	legacy := testkit.Create(t, f.app, rewardItems, map[string]any{"name": "旧图", "pointsPrice": 1, "image": "https://legacy.example.test/reward.jpg"})
	if image := (Module{}).publicReward(legacy)["image"]; image != "https://legacy.example.test/reward.jpg" {
		t.Fatalf("legacy image = %v", image)
	}
	if status := (Module{}).adminReward(testkit.Create(t, f.app, rewardItems, map[string]any{"name": "无状态", "pointsPrice": 1}))["status"]; status != "active" {
		t.Fatalf("blank status = %v", status)
	}
}
