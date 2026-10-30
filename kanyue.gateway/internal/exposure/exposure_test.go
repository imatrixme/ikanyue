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
	if plan.Group != "mapi" || len(plan.Domains) != 1 || plan.Domains[0] != "mapi.ikanyue.com" {
		t.Fatalf("group = %s %v", plan.Group, plan.Domains)
	}
	for _, batch := range plan.APIs {
		if batch.Visibility != "" || batch.Auth != "" {
			t.Errorf("the mini program's APIs stay public with passthrough authentication: %+v", batch)
		}
		for _, pattern := range batch.Operations {
			if !strings.Contains(pattern, " /v1/") {
				t.Errorf("%s exposes %s", batch.Service, pattern)
			}
			// Starting or checking a payment reaches the payment channel; its own
			// policy set lets ops throttle or stop it without touching the rest.
			money := strings.Contains(pattern, "/commerce/") && (strings.HasSuffix(pattern, "/cashier") || strings.HasSuffix(pattern, "/refresh"))
			if money != (batch.PolicySet == "payment") {
				t.Errorf("%s has policy set %q", pattern, batch.PolicySet)
			}
		}
	}
}

func TestParseRejectsBadPlans(t *testing.T) {
	for _, raw := range []string{
		`{"group":"g","domains":["h"],"apis":[]}`,
		`{"group":"g","domains":["h"],"apis":[{"service":"x","operations":["GET /a","GET /a"]}]}`,
		`{"group":"g","domains":["h"],"apis":[{"service":"x","operations":["GET a"]}]}`,
		`{"group":"g","domains":["h"],"apis":[{"service":"x","operations":["GET /a"],"auth":"magic"}]}`,
		`{"group":"g","domains":["h"],"extra":1,"apis":[{"service":"x","operations":["GET /a"]}]}`,
	} {
		if _, err := Parse([]byte(raw)); err == nil {
			t.Errorf("accepted %s", raw)
		}
	}
	if _, err := Load("missing"); err == nil {
		t.Error("loaded a missing plan")
	}
}
