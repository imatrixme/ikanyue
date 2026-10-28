package control

import (
	"bytes"
	"fmt"
	"net/http"
	"slices"
	"strings"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.gateway/internal/policy"
)

// StageDiff is one API or group served differently by two environments.
type StageDiff struct {
	Target
	Name        string            `json:"name"`
	FromVersion int               `json:"fromVersion"` // 0: not served there
	ToVersion   int               `json:"toVersion"`
	Diff        map[string]Change `json:"diff,omitempty"`
}

// Compare lists what from and to serve differently, by target.
func (c *Control) Compare(from, to string) ([]StageDiff, error) {
	if !policy.ValidStage(from) || !policy.ValidStage(to) || from == to {
		return nil, fmt.Errorf("compare two different environments, not %q and %q", from, to)
	}
	left, err := served(c.app, from)
	if err != nil {
		return nil, err
	}
	right, err := served(c.app, to)
	if err != nil {
		return nil, err
	}
	targets := map[Target]bool{}
	for target := range left {
		targets[target] = true
	}
	for target := range right {
		targets[target] = true
	}
	out := []StageDiff{}
	for target := range targets {
		a, b := definitionOf(left[target]), definitionOf(right[target])
		if bytes.Equal(a, b) {
			continue
		}
		diff := StageDiff{Target: target, Diff: definitionDiff(a, b)}
		for _, record := range []*core.Record{left[target], right[target]} {
			if record != nil && diff.Name == "" {
				diff.Name = record.GetString("name")
			}
		}
		if record := left[target]; record != nil && !isNull(a) {
			diff.FromVersion = record.GetInt("version")
		}
		if record := right[target]; record != nil && !isNull(b) {
			diff.ToVersion = record.GetInt("version")
		}
		out = append(out, diff)
	}
	slices.SortFunc(out, func(x, y StageDiff) int {
		if x.Kind != y.Kind {
			return strings.Compare(y.Kind, x.Kind) // groups first
		}
		return strings.Compare(x.Name, y.Name)
	})
	return out, nil
}

func (c *Control) compareRoute(e *core.RequestEvent) error {
	query := e.Request.URL.Query()
	out, err := c.Compare(query.Get("from"), query.Get("to"))
	if err != nil {
		return e.JSON(http.StatusUnprocessableEntity, map[string]any{"error": err.Error()})
	}
	return e.JSON(http.StatusOK, out)
}
