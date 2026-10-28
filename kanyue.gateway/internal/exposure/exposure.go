// Package exposure holds the checked-in lists of operations each public site
// exposes. A list is applied to the configuration as a draft; nothing goes live
// until it is published from the console. mapi.json is what the mini program
// calls, kept equal to ikanyue.taro3 by scripts/gateway-exposure.test.mjs and to
// kanyue.server's routes by its manifest test.
package exposure

import (
	"bytes"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

//go:embed *.json
var files embed.FS

// Plan is one site and the routes it exposes.
type Plan struct {
	Site   string   `json:"site"`
	Hosts  []string `json:"hosts"`
	Routes []Route  `json:"routes"`
}

// Route selects operations of one service by their manifest pattern,
// "METHOD /path/{param}", or the bare path for any-method operations.
type Route struct {
	Name       string   `json:"name"`
	Service    string   `json:"service"`
	Operations []string `json:"operations"`
}

// Load reads the embedded plan name.json.
func Load(name string) (Plan, error) {
	raw, err := files.ReadFile(name + ".json")
	if err != nil {
		return Plan{}, fmt.Errorf("no exposure plan %q", name)
	}
	return Parse(raw)
}

// Parse decodes a plan strictly and rejects empty or duplicated entries.
func Parse(raw []byte) (Plan, error) {
	var plan Plan
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&plan); err != nil {
		return Plan{}, err
	}
	if plan.Site == "" || len(plan.Hosts) == 0 || len(plan.Routes) == 0 {
		return Plan{}, errors.New("a plan needs a site, its hosts and at least one route")
	}
	for _, route := range plan.Routes {
		if route.Name == "" || route.Service == "" || len(route.Operations) == 0 {
			return Plan{}, fmt.Errorf("route %q needs a name, a service and operations", route.Name)
		}
		seen := map[string]bool{}
		for _, pattern := range route.Operations {
			if seen[pattern] || !strings.HasPrefix(pattern[strings.Index(pattern, " ")+1:], "/") {
				return Plan{}, fmt.Errorf("route %q: duplicated or malformed operation %q", route.Name, pattern)
			}
			seen[pattern] = true
		}
	}
	return plan, nil
}
