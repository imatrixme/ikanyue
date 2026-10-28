package exposure

import (
	"strings"
	"testing"
)

// The embedded mini program plan parses and exposes neither operator nor internal routes.
func TestMapiPlan(t *testing.T) {
	plan, err := Load("mapi")
	if err != nil {
		t.Fatal(err)
	}
	if plan.Site != "mapi" || len(plan.Hosts) != 1 || plan.Hosts[0] != "mapi.ikanyue.com" {
		t.Fatalf("site = %s %v", plan.Site, plan.Hosts)
	}
	for _, route := range plan.Routes {
		for _, pattern := range route.Operations {
			if !strings.Contains(pattern, " /v1/") {
				t.Errorf("%s exposes %s", route.Name, pattern)
			}
		}
	}
}

func TestParseRejectsBadPlans(t *testing.T) {
	for _, raw := range []string{
		`{"site":"s","hosts":["h"],"routes":[]}`,
		`{"site":"s","hosts":["h"],"routes":[{"name":"r","service":"x","operations":["GET /a","GET /a"]}]}`,
		`{"site":"s","hosts":["h"],"routes":[{"name":"r","service":"x","operations":["GET a"]}]}`,
		`{"site":"s","hosts":["h"],"extra":1,"routes":[{"name":"r","service":"x","operations":["GET /a"]}]}`,
	} {
		if _, err := Parse([]byte(raw)); err == nil {
			t.Errorf("accepted %s", raw)
		}
	}
	if _, err := Load("missing"); err == nil {
		t.Error("loaded a missing plan")
	}
}
