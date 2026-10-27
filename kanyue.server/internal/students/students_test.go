package students

import (
	"net/http"
	"testing"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/testkit"
)

func setup(t *testing.T) (core.App, http.Handler, func(isAdmin bool) map[string]string) {
	t.Helper()
	app := testkit.NewApp(t)
	signer, err := auth.NewSigner(testkit.Secret)
	if err != nil {
		t.Fatal(err)
	}
	admin := testkit.Create(t, app, "teachers", map[string]any{"email": "admin@example.com", "password": "admin-pass-1"})
	token := func(isAdmin bool) map[string]string {
		value, _ := signer.Sign(admin.Id, "T1", "teacher", isAdmin, auth.Claims{"scope": auth.OpsScope}, auth.OpsTokenTTL)
		return testkit.Bearer(value)
	}
	return app, testkit.Serve(t, app, Module{Signer: signer}.Register), token
}

func TestListFiltersSortsAndPages(t *testing.T) {
	app, handler, token := setup(t)
	testkit.Create(t, app, "students", map[string]any{"cellphone": "13800000001", "realName": "张三", "nickName": "小张"})
	testkit.Create(t, app, "students", map[string]any{"cellphone": "13800000002", "realName": "李四", "blocked": true})
	testkit.Create(t, app, "students", map[string]any{"cellphone": "13900000003", "realName": "王五", "password": "secret-hash"})

	if denied := testkit.Call(t, handler, http.MethodGet, "/ops/students", nil, token(false)); denied.Code() != 403 || denied.Body["message"] != "需要管理员权限" {
		t.Fatalf("non-admin list = %v", denied.Body)
	}
	all := testkit.Call(t, handler, http.MethodGet, "/ops/students?sort=name-asc&perPage=2", nil, token(true)).Data()
	items, _ := all["items"].([]any)
	pagination, _ := all["pagination"].(map[string]any)
	if len(items) != 2 || pagination["totalItems"] != float64(3) || pagination["totalPages"] != float64(2) || pagination["perPage"] != float64(2) {
		t.Fatalf("paged list = %v", all)
	}
	first, _ := items[0].(map[string]any)
	if _, leaked := first["password"]; leaked || first["created"] == "" || first["lastLoginAt"] != "" {
		t.Fatalf("projection = %v", first)
	}

	cases := map[string]int{
		"/ops/students?q=138":                        2,
		"/ops/students?q=%20&keyword=王":              3, // a blank q still wins over keyword, like `q || keyword`
		"/ops/students?keyword=小张":                   1,
		"/ops/students?status=inactive":              1,
		"/ops/students?status=active&limit=1&page=2": 1,
	}
	for url, want := range cases {
		data := testkit.Call(t, handler, http.MethodGet, url, nil, token(true)).Data()
		got, _ := data["items"].([]any)
		if len(got) != want {
			t.Fatalf("%s returned %d items, want %d: %v", url, len(got), want, data)
		}
	}
}

func TestCreateAndUpdateStudent(t *testing.T) {
	app, handler, token := setup(t)
	testkit.Create(t, app, "students", map[string]any{"cellphone": "13800000009", "realName": "已存在"})

	checks := []struct {
		body    map[string]any
		code    int
		message string
	}{
		{map[string]any{"realName": "新学员", "password": "p"}, 400, "手机号不能为空"},
		{map[string]any{"cellphone": "13800000001", "password": "p"}, 400, "学员姓名不能为空"},
		{map[string]any{"cellphone": "13800000001", "realName": "新学员", "password": "  "}, 400, "初始密码不能为空"},
		{map[string]any{"cellphone": "13800000009", "realName": "新学员", "password": "p"}, 409, "手机号已注册"},
	}
	for _, check := range checks {
		result := testkit.Call(t, handler, http.MethodPost, "/ops/students", check.body, token(true))
		if result.Code() != check.code || result.Body["message"] != check.message {
			t.Fatalf("create %v = %v", check.body, result.Body)
		}
	}

	created := testkit.Call(t, handler, http.MethodPost, "/ops/students",
		map[string]any{"cellphone": " 13800000001 ", "realName": " 新学员 ", "nickName": "小新", "password": "init", "blocked": "1"}, token(true))
	data := created.Data()
	if created.Code() != 10000 || data["cellphone"] != "13800000001" || data["realName"] != "新学员" || data["blocked"] != true {
		t.Fatalf("create = %v", created.Body)
	}
	id, _ := data["id"].(string)
	record, err := app.FindRecordById("students", id)
	if err != nil {
		t.Fatal(err)
	}
	if record.GetString("password") != md5Hex("init") || len(record.GetString("sn")) != 36 || len(record.GetString("tokenKey")) != 36 {
		t.Fatalf("stored student = %v", record.PublicExport())
	}

	if missing := testkit.Call(t, handler, http.MethodPost, "/ops/students/nope", map[string]any{}, token(true)); missing.Code() != 404 {
		t.Fatalf("update missing = %v", missing.Body)
	}
	if taken := testkit.Call(t, handler, http.MethodPost, "/ops/students/"+id,
		map[string]any{"cellphone": "13800000009", "realName": "新学员"}, token(true)); taken.Code() != 409 {
		t.Fatalf("update to a taken phone = %v", taken.Body)
	}
	updated := testkit.Call(t, handler, http.MethodPost, "/ops/students/"+id,
		map[string]any{"cellphone": "13800000001", "realName": "改名", "blocked": false}, token(true))
	if updated.Code() != 10000 || updated.Data()["realName"] != "改名" || updated.Data()["nickName"] != "" || updated.Data()["blocked"] != false {
		t.Fatalf("update = %v", updated.Body)
	}
	record, _ = app.FindRecordById("students", id)
	if record.GetString("password") != md5Hex("init") {
		t.Fatal("a blank password must keep the current one")
	}

	audits, err := app.FindRecordsByFilter("ops_audit_logs", `resourceType="students"`, "@rowid", 0, 0)
	if err != nil || len(audits) != 2 || audits[0].GetString("action") != "ops.students.create" || audits[1].GetString("action") != "ops.students.update" {
		t.Fatalf("audits = %v, %v", audits, err)
	}
}
