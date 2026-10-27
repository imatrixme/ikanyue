package jsx

import (
	"math"
	"testing"
	"time"
)

func TestNumberFollowsJavaScript(t *testing.T) {
	cases := []struct {
		value any
		want  float64
	}{
		{nil, 0}, {"", 0}, {" 42 ", 42}, {"1e2", 100}, {"0x10", 16}, {".5", 0.5}, {true, 1},
		{[]any{}, 0}, {[]any{"7"}, 7}, {"-Infinity", math.Inf(-1)},
	}
	for _, c := range cases {
		if got := Number(c.value); got != c.want {
			t.Fatalf("Number(%#v) = %v, want %v", c.value, got, c.want)
		}
	}
	for _, value := range []any{Undefined{}, "12px", "1_000", "-0x10", map[string]any{}, []any{1.0, 2.0}} {
		if got := Number(value); !math.IsNaN(got) {
			t.Fatalf("Number(%#v) = %v, want NaN", value, got)
		}
	}
	if !IsInteger("3") || IsInteger("1.5") || IsInteger(Undefined{}) {
		t.Fatal("IsInteger must follow Number.isInteger(Number(value))")
	}
}

func TestDateParseCoversHonoInputs(t *testing.T) {
	utc := map[string]string{
		"2026-03-01":               "2026-03-01T00:00:00.000Z",
		"2026-03-01 08:30:00.123Z": "2026-03-01T08:30:00.123Z",
		"2026-03-01T08:30+08:00":   "2026-03-01T00:30:00.000Z",
	}
	for input, want := range utc {
		parsed, ok := DateParse(input)
		if !ok || ISO(parsed) != want {
			t.Fatalf("DateParse(%q) = %v, %v; want %s", input, ISO(parsed), ok, want)
		}
	}
	if parsed, ok := DateParse("2026-03-01T08:30:00"); !ok || parsed.Location() != time.Local {
		t.Fatal("a date-time without a zone is local time")
	}
	for _, input := range []any{"", "tomorrow", "2026-13-01", nil, Undefined{}, 5.0} {
		if _, ok := DateParse(input); ok {
			t.Fatalf("DateParse(%#v) must be NaN", input)
		}
	}
}

func TestSliceCountsUTF16Units(t *testing.T) {
	if Length("音😀") != 3 || Slice("音音音", 2) != "音音" || Slice("ab", 5) != "ab" {
		t.Fatal("Length and Slice must count UTF-16 code units")
	}
}
