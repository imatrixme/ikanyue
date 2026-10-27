package students

import (
	"net/http"
	"reflect"
	"testing"

	"kanyue.server/internal/testkit"
)

// Hono: opsStudentAdmin › student admin service covers paging, sorting, password reset, and fallback projections
func TestStudentAdminPagingSortingAndPasswordReset(t *testing.T) {
	app, handler, token := setup(t)
	testkit.Create(t, app, "students", map[string]any{"cellphone": "13800000001", "realName": "张三"})
	call := func(method, url string, body map[string]any) testkit.Response {
		return testkit.Call(t, handler, method, url, body, token(true))
	}

	if denied := testkit.Call(t, handler, http.MethodGet, "/ops/students", nil, token(false)); denied.Body["message"] != "需要管理员权限" {
		t.Fatalf("non-admin = %v", denied.Body)
	}
	if blank := call(http.MethodPost, "/ops/students/%20", map[string]any{}); blank.Code() != 400 || blank.Body["message"] != "学员不能为空" {
		t.Fatalf("blank id = %v", blank.Body)
	}

	// PocketBase quoted filter text cannot end in a backslash, so the escaped keyword keeps one inside.
	paged := call(http.MethodGet, `/ops/students?page=bad&limit=999&keyword=%E5%BC%A0%22%5C%E4%B8%89&sort=name-desc`, nil)
	if pagination, _ := paged.Data()["pagination"].(map[string]any); paged.Code() != 10000 || pagination["perPage"] != 100.0 || pagination["page"] != 1.0 {
		t.Fatalf("paged = %v", paged.Body)
	}
	for _, sort := range []string{"created-asc", "unknown"} {
		if result := call(http.MethodGet, "/ops/students?sort="+sort, nil); result.Code() != 10000 || len(result.Data()["items"].([]any)) != 1 {
			t.Fatalf("sort %s = %v", sort, result.Body)
		}
	}
	if sortValue("created-asc") != "created" || sortValue("unknown") != "-created" || sortValue("name-desc") != "-realName" {
		t.Fatal("sort mapping")
	}

	created := call(http.MethodPost, "/ops/students", map[string]any{"cellphone": "13800000002", "realName": "无审计学员",
		"password": "secret", "blocked": "1"}).Data()
	if created["blocked"] != true {
		t.Fatalf("created = %v", created)
	}
	id := created["id"].(string)
	updated := call(http.MethodPost, "/ops/students/"+id, map[string]any{"cellphone": "13900000003", "realName": "密码已重置",
		"password": "new-secret", "blocked": false}).Data()
	record, _ := app.FindRecordById("students", id)
	if updated["cellphone"] != "13900000003" || record.GetString("password") != md5Hex("new-secret") {
		t.Fatalf("reset = %v", updated)
	}
	if same := call(http.MethodPost, "/ops/students/"+id, map[string]any{"cellphone": "13900000003", "realName": "手机号不变",
		"password": "", "blocked": false}); same.Code() != 10000 {
		t.Fatalf("unchanged phone = %v", same.Body)
	}

	empty := testkit.Create(t, app, "students", map[string]any{})
	projected := project(empty)
	if !reflect.DeepEqual([]any{projected.Avatar, projected.Blocked, projected.Cellphone, projected.LastLoginAt, projected.NickName,
		projected.RealName}, []any{"", false, "", "", "", ""}) {
		t.Fatalf("sparse projection = %+v", projected)
	}
}
