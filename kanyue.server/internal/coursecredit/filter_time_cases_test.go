package coursecredit

import (
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"
)

// Hono: pocketbaseTimeFilterGuard › filterTime renders instants in the PocketBase stored format
func TestFilterTimeRendersStoredFormat(t *testing.T) {
	instant := time.Date(2026, 10, 22, 1, 0, 0, 0, time.UTC)
	for _, input := range []any{"2026-10-22T01:00:00.000Z", "2026-10-22T09:00:00+08:00", float64(instant.UnixMilli()), instant} {
		if got := filterTime(input); got != "2026-10-22 01:00:00.000Z" {
			t.Fatalf("filterTime(%v) = %q", input, got)
		}
	}
	if filterTime("") != "" || filterTime(nil) != "" {
		t.Fatal("blank input must stay blank")
	}
}

var timeComparison = regexp.MustCompile(`[A-Za-z.]*(?:At|Date|Deadline|From|To|created|updated)\s*[<>]=?\s*"` + "`" + `\s*\+\s*([^+\n]+)`)

// Hono: pocketbaseTimeFilterGuard › every interpolated time comparison in a filter goes through filterTime
// PocketBase stores "YYYY-MM-DD HH:MM:SS.sssZ"; an ISO "T" literal compares as text
// and silently shifts range filters, so every literal must be normalized.
func TestTimeFiltersGoThroughFilterTime(t *testing.T) {
	offenders := []string{}
	err := filepath.WalkDir("..", func(path string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return err
		}
		raw, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		source := string(raw)
		for _, match := range timeComparison.FindAllStringSubmatch(source, -1) {
			if !normalizedTime(source, strings.TrimSpace(match[1])) {
				offenders = append(offenders, path+": "+match[0])
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(offenders) > 0 {
		t.Fatalf("time literals without filterTime:\n%s", strings.Join(offenders, "\n"))
	}
}

// normalizedTime accepts an inline filterTime call or a local variable assigned from one.
func normalizedTime(source, expression string) bool {
	if strings.Contains(expression, "filterTime(") {
		return true
	}
	if !regexp.MustCompile(`^[A-Za-z_]\w*$`).MatchString(expression) {
		return false
	}
	return regexp.MustCompile(`\b` + expression + `\s*:?=\s*[^\n]*\bfilterTime\(`).MatchString(source)
}

// Hono: recordMappers › resolveRelationId supports empty, scalar, and relation array values
func TestRelationIDResolvesRelationShapes(t *testing.T) {
	for _, tc := range []struct {
		value any
		want  string
	}{
		{nil, ""}, {"student_1", "student_1"}, {[]any{"student_2", "student_3"}, "student_2"}, {[]any{}, ""},
		{map[string]any{"id": "student_4"}, "student_4"},
	} {
		if got := relationID(tc.value); got != tc.want {
			t.Fatalf("relationID(%v) = %q", tc.value, got)
		}
	}
}
