package activities

import (
	"net/http"
	"slices"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/testkit"
)

func setup(t *testing.T, module Module) (core.App, http.Handler) {
	t.Helper()
	app := testkit.NewApp(t)
	activities := core.NewBaseCollection(collection)
	activities.Fields.Add(&core.TextField{Name: "title"}, &core.TextField{Name: "location"}, &core.TextField{Name: "tags"},
		&core.TextField{Name: "status"}, &core.TextField{Name: "type"}, &core.DateField{Name: "startTime"},
		&core.NumberField{Name: "sequence"}, &core.FileField{Name: "coverImage", MaxSelect: 1},
		&core.FileField{Name: "images", MaxSelect: 10},
		&core.AutodateField{Name: "created", OnCreate: true}, &core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true})
	if err := app.Save(activities); err != nil {
		t.Fatal(err)
	}
	return app, testkit.Serve(t, app, module.Register)
}

func titles(t *testing.T, data map[string]any) []string {
	t.Helper()
	result := []string{}
	items, _ := data["items"].([]any)
	for _, item := range items {
		result = append(result, item.(map[string]any)["title"].(string))
	}
	return result
}

// Hono: pageFacingFindRoutes › activity find route supports miniapp list params and detail requests
func TestListFiltersAndDetail(t *testing.T) {
	app, handler := setup(t, Module{PBPublicURL: "https://pb.example.com"})
	open := testkit.Create(t, app, collection, map[string]any{"title": "公开课", "status": "active", "tags": "声乐,体验", "type": "lesson",
		"location": "上海静安", "startTime": "2026-03-01 10:00:00.000Z", "sequence": 2})
	testkit.Create(t, app, collection, map[string]any{"title": "其它城市", "status": "active", "tags": "声乐,体验", "type": "lesson",
		"location": "北京", "startTime": "2026-03-01 10:00:00.000Z", "sequence": 3})
	testkit.Create(t, app, collection, map[string]any{"title": "去年", "status": "active", "tags": "声乐,体验", "type": "lesson",
		"location": "上海", "startTime": "2025-03-01 10:00:00.000Z", "sequence": 1})
	if _, err := app.DB().NewQuery("UPDATE activities SET coverImage = 'cover.jpg', images = '[\"one.jpg\"]' WHERE id = {:id}").
		Bind(dbx.Params{"id": open.Id}).Execute(); err != nil {
		t.Fatal(err)
	}

	list := testkit.Call(t, handler, http.MethodGet, "/v1/activity/find?perPage=100&status=active&tags=声乐,体验&type=lesson&location=上海"+
		"&start_time_gte=2026-01-01T00%3A00%3A00.000Z&start_time_lte=2026-12-31T23%3A59%3A59.999Z&sort=-sequence", nil, nil)
	data := list.Data()
	if list.Code() != 10000 || list.Body["message"] != "查询成功" || data["page"] != float64(1) || data["perPage"] != float64(100) ||
		!slices.Equal(titles(t, data), []string{"公开课"}) {
		t.Fatalf("list = %v", list.Body)
	}
	item := data["items"].([]any)[0].(map[string]any)
	base := "https://pb.example.com/api/files/" + open.Collection().Id + "/" + open.Id + "/"
	if item["coverImageUrl"] != base+"cover.jpg" || !slices.Equal(item["imageUrls"].([]any), []any{base + "one.jpg"}) {
		t.Fatalf("file urls = %v", item)
	}
	if sorted := testkit.Call(t, handler, http.MethodGet, "/v1/activity/find?sort=-sequence", nil, nil).Data(); !slices.Equal(titles(t, sorted), []string{"其它城市", "公开课", "去年"}) {
		t.Fatalf("sorted = %v", sorted)
	}
	if camel := testkit.Call(t, handler, http.MethodGet, "/v1/activity/find?startTimeGte=2026-01-01&sort=sequence", nil, nil).Data(); !slices.Equal(titles(t, camel), []string{"公开课", "其它城市"}) {
		t.Fatalf("camel bounds = %v", camel)
	}

	detail := testkit.Call(t, handler, http.MethodGet, "/v1/activity/find?id="+open.Id, nil, nil)
	if detail.Code() != 10000 || detail.Data()["id"] != open.Id || detail.Data()["coverImageUrl"] != base+"cover.jpg" {
		t.Fatalf("detail = %v", detail.Body)
	}
}

// The stored form makes the boundary day exact: an activity at 10:00 on the
// lower bound's day is included and one at 10:00 on the upper bound's day after 09:00 is not.
func TestStartTimeBoundsUseStoredDateFormat(t *testing.T) {
	app, handler := setup(t, Module{})
	testkit.Create(t, app, collection, map[string]any{"title": "边界", "status": "active", "startTime": "2026-03-01 10:00:00.000Z"})
	if same := testkit.Call(t, handler, http.MethodGet, "/v1/activity/find?start_time_gte=2026-03-01T10:00:00.000Z", nil, nil).Data(); len(titles(t, same)) != 1 {
		t.Fatalf("inclusive lower bound = %v", same)
	}
	if before := testkit.Call(t, handler, http.MethodGet, "/v1/activity/find?start_time_lte=2026-03-01T09:00:00.000Z", nil, nil).Data(); len(titles(t, before)) != 0 {
		t.Fatalf("upper bound = %v", before)
	}
}

// Hono: pageFacingFindRoutes › activity find route covers miniapp validation and failure flows
func TestValidationAndFailures(t *testing.T) {
	_, handler := setup(t, Module{})
	checks := map[string]struct {
		code    int
		message string
	}{
		"/v1/activity/find?page=0":                 {400, "页码和每页数量必须为正整数"},
		"/v1/activity/find?page=":                  {400, "页码和每页数量必须为正整数"},
		"/v1/activity/find?page=1.5":               {400, "页码和每页数量必须为正整数"},
		"/v1/activity/find?limit=abc":              {400, "页码和每页数量必须为正整数"},
		"/v1/activity/find?perPage=101":            {400, "每页数量不能超过100"},
		"/v1/activity/find?id=missing":             {404, "活动不存在"},
		"/v1/activity/find?start_time_gte=notdate": {400, "活动时间范围无效"},
	}
	for url, want := range checks {
		response := testkit.Call(t, handler, http.MethodGet, url, nil, nil)
		if response.Code() != want.code || response.Body["message"] != want.message {
			t.Fatalf("%s = %v", url, response.Body)
		}
	}

	app := testkit.NewApp(t)
	broken := testkit.Serve(t, app, Module{}.Register)
	if failed := testkit.Call(t, broken, http.MethodGet, "/v1/activity/find?page=9", nil, nil); failed.Code() != 500 || failed.Body["message"] != "查询失败，请稍后重试" {
		t.Fatalf("list without collection = %v", failed.Body)
	}
	// PocketBase REST answers a missing collection with 404 too, so Hono reported it as missing.
	if missing := testkit.Call(t, broken, http.MethodGet, "/v1/activity/find?id=broken", nil, nil); missing.Code() != 404 {
		t.Fatalf("detail without collection = %v", missing.Body)
	}
}

// Hono: pageFacingFindRoutes › activity find route only exposes published activities and matches values literally
// Hono: pointsLite › biz route registry restores public activities without reopening removed full-product routes
func TestOnlyPublishedAndLiteralFilters(t *testing.T) {
	app, handler := setup(t, Module{})
	draft := testkit.Create(t, app, collection, map[string]any{"title": "草稿", "status": "draft"})
	testkit.Create(t, app, collection, map[string]any{"title": "发布", "status": "active", "type": "x", "sequence": 1})

	if all := testkit.Call(t, handler, http.MethodGet, "/v1/activity/find?status=all", nil, nil).Data(); !slices.Equal(titles(t, all), []string{"发布"}) {
		t.Fatalf("status param must not widen the list: %v", all)
	}
	injection := "x%22%20%7C%7C%20status%20%3D%20%22draft"
	for _, param := range []string{"type", "location", "tags"} {
		response := testkit.Call(t, handler, http.MethodGet, "/v1/activity/find?sort=password&"+param+"="+injection, nil, nil)
		if response.Code() != 10000 || len(titles(t, response.Data())) != 0 {
			t.Fatalf("%s injection = %v", param, response.Body)
		}
	}
	if sorted := testkit.Call(t, handler, http.MethodGet, "/v1/activity/find?sort=-startTime,sequence", nil, nil); sorted.Code() != 10000 {
		t.Fatalf("multi sort = %v", sorted.Body)
	}
	if hidden := testkit.Call(t, handler, http.MethodGet, "/v1/activity/find?id="+draft.Id, nil, nil); hidden.Code() != 404 {
		t.Fatalf("draft detail = %v", hidden.Body)
	}
	for value, want := range map[string]string{"password": defaultSort, "": defaultSort, "-startTime, sequence": "-startTime,sequence", "+updated": "+updated", "--created": defaultSort} {
		if got := safeSort(value); got != want {
			t.Fatalf("safeSort(%q) = %q", value, got)
		}
	}
}
