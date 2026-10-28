package snapshot

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func testConfig() Config {
	return Config{
		Version:  3,
		Sites:    []Site{{ID: "api", Name: "api", Hosts: []string{"MAPI.ikanyue.com"}}, {ID: "rest", Name: "rest", Hosts: []string{"*"}}},
		Services: []Service{{ID: "server", Name: "kanyue.server"}},
		Routes: []Route{
			{ID: "r1", Name: "student", Site: "api", Service: "server", Operations: []Operation{
				{ID: "o1", Method: "GET", Path: "/v1/student/appointments/{appointmentId}"},
				{ID: "o2", Method: "POST", Path: "/v1/student/appointments"},
			}},
			{ID: "r2", Name: "console", Site: "rest", Service: "server", Operations: []Operation{{ID: "o3", Path: "/{path...}"}}},
		},
	}
}

// Matching follows ServeMux precedence per site; unknown hosts fall to the "*" site.
func TestCompileMatchesBySiteMethodAndPattern(t *testing.T) {
	routes, err := Compile(testConfig(), nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range []struct{ method, url, op string }{
		{"GET", "http://mapi.ikanyue.com:443/v1/student/appointments/a1", "o1"},
		{"HEAD", "http://mapi.ikanyue.com/v1/student/appointments/a1", "o1"},
		{"POST", "http://mapi.ikanyue.com/v1/student/appointments", "o2"},
		{"GET", "http://admin.example.com/ops/anything", "o3"},
		{"DELETE", "http://admin.example.com/", "o3"},
		{"GET", "http://mapi.ikanyue.com/v1/student/appointments", ""},
		{"GET", "http://mapi.ikanyue.com/v1/other", ""},
	} {
		got := ""
		if target, ok := routes.Match(httptest.NewRequest(item.method, item.url, nil)); ok {
			got = target.Operation.ID
		}
		if got != item.op {
			t.Errorf("%s %s = %q, want %q", item.method, item.url, got, item.op)
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

// Every invalid part is reported at once, and ServeMux conflicts never panic.
func TestCompileRejectsInvalidConfigurations(t *testing.T) {
	cfg := testConfig()
	cfg.Sites = append(cfg.Sites, Site{ID: "dup", Name: "dup", Hosts: []string{"mapi.ikanyue.com"}}, Site{ID: "empty", Name: "empty"})
	cfg.Routes = append(cfg.Routes,
		Route{ID: "r3", Name: "again", Site: "api", Service: "server", Operations: []Operation{{ID: "o9", Method: "POST", Path: "/v1/student/appointments"}}},
		Route{ID: "r4", Name: "nowhere", Site: "missing", Service: "server", Operations: []Operation{{Path: "/x"}}},
		Route{ID: "r5", Name: "orphan", Site: "api", Service: "missing", Operations: []Operation{{Path: "/y"}}},
		Route{ID: "r6", Name: "hollow", Site: "api", Service: "server"},
		Route{ID: "r7", Name: "broken", Site: "api", Service: "server", Operations: []Operation{{Method: "GET", Path: "no-slash"}}},
	)
	_, err := Compile(cfg, nil, nil)
	if err == nil {
		t.Fatal("compiled")
	}
	for _, want := range []string{`host "mapi.ikanyue.com" belongs to more than one site`, `site "empty" has no hosts`,
		`route "again"`, `route "nowhere": unknown site`, `route "orphan": unknown service`, `route "hollow" has no operations`, `route "broken"`} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error lacks %q:\n%v", want, err)
		}
	}
}
