// Package exposure holds the checked-in API groups the gateway exposes: each
// names a group, its domains and the operations exposed as its APIs. A plan is
// applied as drafts; nothing goes live until its APIs are released to an
// environment from the console. mapi.json is what the mini program calls, kept
// equal to ikanyue.mini by scripts/gateway-exposure.test.mjs and to
// kanyue.server's routes by its manifest test.
package exposure

import (
	"bytes"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
)

//go:embed *.json
var files embed.FS

// Plan is one API group and the APIs it exposes.
type Plan struct {
	Group   string   `json:"group"`
	Domains []string `json:"domains"`
	APIs    []APIs   `json:"apis"`
}

// APIs selects operations of one service by their manifest pattern,
// "METHOD /path/{param}", or the bare path for any-method operations, and
// gives them the same settings.
type APIs struct {
	Service    string   `json:"service"`
	Operations []string `json:"operations"`
	// Visibility is public (default) or private.
	Visibility string `json:"visibility,omitempty"`
	// Auth is passthrough (default), none, signature or jwt.
	Auth string `json:"auth,omitempty"`
	// PolicySet names the policy set the APIs attach, if any.
	PolicySet string `json:"policySet,omitempty"`
}

// Load reads the embedded plan name.json.
func Load(name string) (Plan, error) {
	raw, err := files.ReadFile(name + ".json")
	if err != nil {
		return Plan{}, fmt.Errorf("no exposure plan %q", name)
	}
	return Parse(raw)
}

// Parse decodes a plan strictly and rejects empty, duplicated or malformed entries.
func Parse(raw []byte) (Plan, error) {
	var plan Plan
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&plan); err != nil {
		return Plan{}, err
	}
	if plan.Group == "" || len(plan.Domains) == 0 || len(plan.APIs) == 0 {
		return Plan{}, errors.New("a plan needs a group, its domains and at least one batch of APIs")
	}
	seen := map[string]bool{}
	for i, batch := range plan.APIs {
		if batch.Service == "" || len(batch.Operations) == 0 {
			return Plan{}, fmt.Errorf("apis[%d] needs a service and operations", i)
		}
		if batch.Visibility != "" && !slices.Contains([]string{"public", "private"}, batch.Visibility) {
			return Plan{}, fmt.Errorf("apis[%d]: unknown visibility %q", i, batch.Visibility)
		}
		if batch.Auth != "" && !slices.Contains([]string{"passthrough", "none", "signature", "jwt"}, batch.Auth) {
			return Plan{}, fmt.Errorf("apis[%d]: unknown authentication %q", i, batch.Auth)
		}
		for _, pattern := range batch.Operations {
			key := batch.Service + " " + pattern
			if seen[key] || !strings.HasPrefix(pattern[strings.Index(pattern, " ")+1:], "/") {
				return Plan{}, fmt.Errorf("apis[%d]: duplicated or malformed operation %q", i, pattern)
			}
			seen[key] = true
		}
	}
	return plan, nil
}
