package snapshot

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func api(id, group string, priority int, method, path string) API {
	return API{ID: id, Name: id, Group: group, Service: "server", Priority: priority, Operation: Operation{ID: "op-" + id, Method: method, Path: path},
		Visibility: "public", Auth: "passthrough"}
}

func testConfig() Config {
	return Config{
		Stage:   "RELEASE",
		Version: 3,
		Groups: []Group{{ID: "mapi", Name: "mapi", Domains: []Domain{{Host: "MAPI.ikanyue.com"}}},
			{ID: "rest", Name: "rest", Domains: []Domain{{Host: "*"}}}},
		Services: []Service{{ID: "server", Name: "kanyue.server"}},
		APIs: []API{
			api("o1", "mapi", 0, "GET", "/v1/student/appointments/{appointmentId}"),
			api("o2", "mapi", 0, "POST", "/v1/student/appointments"),
			api("o3", "rest", 0, "", "/{path...}"),
			// A higher priority wins on its domain even where a lower one matches more specifically.
			api("o4", "mapi", 10, "GET", "/v1/student/{rest...}"),
		},
	}
}

// Matching follows priority, then ServeMux precedence per domain; unknown hosts fall to "*".
func TestCompileMatchesByDomainPriorityAndPattern(t *testing.T) {
	routes, err := Compile(testConfig(), nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range []struct{ method, url, api string }{
		{"GET", "http://mapi.ikanyue.com:443/v1/student/appointments/a1", "o4"},
		{"POST", "http://mapi.ikanyue.com/v1/student/appointments", "o2"},
		{"GET", "http://admin.example.com/ops/anything", "o3"},
		{"DELETE", "http://admin.example.com/", "o3"},
		{"GET", "http://mapi.ikanyue.com/v1/other", ""},
	} {
		got := ""
		if target, ok := routes.Match(httptest.NewRequest(item.method, item.url, nil)); ok {
			got = target.Route
			if target.Stage != "RELEASE" || target.Group == "" {
				t.Errorf("target = %+v", target)
			}
		}
		if got != item.api {
			t.Errorf("%s %s = %q, want %q", item.method, item.url, got, item.api)
		}
	}
	if routes.Version != 3 {
		t.Fatalf("version = %d", routes.Version)
	}
	var none *Routes
	if _, ok := none.Match(httptest.NewRequest("GET", "/", nil)); ok {
		t.Fatal("nil routes matched")
	}
}

// Every invalid part is reported at once, conflicts name both APIs, and ServeMux never panics.
func TestCompileRejectsInvalidConfigurations(t *testing.T) {
	cfg := testConfig()
	cfg.Groups = append(cfg.Groups, Group{ID: "dup", Name: "dup", Domains: []Domain{{Host: "mapi.ikanyue.com"}}}, Group{ID: "empty", Name: "empty"})
	cfg.APIs = append(cfg.APIs,
		api("again", "mapi", 0, "POST", "/v1/student/appointments"),
		api("nowhere", "missing", 0, "GET", "/x"),
		api("orphan", "mapi", 0, "GET", "/y"),
		api("broken", "mapi", 0, "GET", "no-slash"),
	)
	cfg.APIs[len(cfg.APIs)-2].Service = "missing"
	_, err := Compile(cfg, nil, nil)
	if err == nil {
		t.Fatal("compiled")
	}
	for _, want := range []string{`domain "mapi.ikanyue.com" belongs to groups "mapi" and "dup"`, `group "empty" has no domains`,
		`API "again": pattern "POST /v1/student/appointments" conflicts with API "o2" at priority 0`,
		`API "nowhere": its group is not released in RELEASE`, `API "orphan": unknown service`, `API "broken"`} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error lacks %q:\n%v", want, err)
		}
	}
	if _, err := Compile(Config{Stage: "DEV"}, nil, nil); err == nil {
		t.Fatal("compiled an unknown environment")
	}
}

// The environment comes from a fixed domain, else X-Ca-Stage, else RELEASE;
// a domain fixed to an environment is not served by the others.
func TestTableResolvesEnvironments(t *testing.T) {
	release := testConfig()
	test := testConfig()
	test.Stage = "TEST"
	test.Groups = append(test.Groups, Group{ID: "beta", Name: "beta", Domains: []Domain{{Host: "beta.ikanyue.com", FixedStage: "TEST"}}})
	test.APIs = append(test.APIs, api("b1", "beta", 0, "GET", "/v1/beta"))
	release.Groups = append(release.Groups, test.Groups[2])
	var table *Table
	for _, cfg := range []Config{release, test} {
		routes, err := Compile(cfg, nil, nil)
		if err != nil {
			t.Fatal(err)
		}
		if table, err = table.With(routes); err != nil {
			t.Fatal(err)
		}
	}
	for _, item := range []struct{ host, header, stage string }{
		{"mapi.ikanyue.com", "", "RELEASE"},
		{"mapi.ikanyue.com", " test ", "TEST"},
		{"beta.ikanyue.com:443", "RELEASE", "TEST"},
	} {
		if stage, ok := table.Stage(item.host, item.header); !ok || stage != item.stage {
			t.Errorf("%s %q = %s %v", item.host, item.header, stage, ok)
		}
	}
	if _, ok := table.Stage("mapi.ikanyue.com", "DEV"); ok {
		t.Fatal("unknown environment accepted")
	}
	// RELEASE does not serve the TEST-only domain: it falls to "*".
	if target, _ := table.Routes("RELEASE").Match(httptest.NewRequest("GET", "http://beta.ikanyue.com/v1/beta", nil)); target.Route != "o3" {
		t.Fatalf("RELEASE served the TEST-only domain: %+v", target)
	}
	if target, ok := table.Routes("TEST").Match(httptest.NewRequest("GET", "http://beta.ikanyue.com/v1/beta", nil)); !ok || target.Route != "b1" {
		t.Fatalf("TEST beta = %+v", target)
	}
	if v := table.Versions(); v["RELEASE"] != 3 || v["TEST"] != 3 || v["PRE"] != 0 {
		t.Fatalf("versions = %v", v)
	}
	if len(table.Services()) != 1 {
		t.Fatalf("services = %v", table.Services())
	}

	pre := testConfig()
	pre.Stage = "PRE"
	pre.Groups[0].Domains = []Domain{{Host: "beta.ikanyue.com", FixedStage: "PRE"}}
	routes, err := Compile(pre, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := table.With(routes); err == nil || !strings.Contains(err.Error(), `domain "beta.ikanyue.com" is fixed to both TEST and PRE`) {
		t.Fatalf("double fixed domain: %v", err)
	}
}
