// Package jsx reproduces the JavaScript coercions Hono's validation relies on
// (Number(), Date.parse(), String.length), applied to decoded JSON values.
package jsx

import (
	"math"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf16"
)

// Undefined marks a key absent from a JSON object, which JavaScript tells apart from null.
type Undefined struct{}

// Get returns m[key] or Undefined when the key is absent.
func Get(m map[string]any, key string) any {
	if value, ok := m[key]; ok {
		return value
	}
	return Undefined{}
}

var (
	decimalNumber = regexp.MustCompile(`^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$`)
	prefixedInt   = regexp.MustCompile(`^0([xX][0-9a-fA-F]+|[oO][0-7]+|[bB][01]+)$`)
)

// Number is JavaScript Number(value).
func Number(value any) float64 {
	switch v := value.(type) {
	case nil:
		return 0
	case Undefined:
		return math.NaN()
	case bool:
		if v {
			return 1
		}
		return 0
	case float64:
		return v
	case int:
		return float64(v)
	case string:
		return numberFromString(v)
	case []any:
		if len(v) == 0 {
			return 0
		}
		if len(v) == 1 {
			switch v[0].(type) {
			case nil:
				return 0
			case []any, map[string]any:
				return Number(v[0])
			}
			return numberFromString(String(v[0]))
		}
	}
	return math.NaN()
}

func numberFromString(text string) float64 {
	text = strings.TrimSpace(text)
	switch {
	case text == "":
		return 0
	case text == "Infinity" || text == "+Infinity":
		return math.Inf(1)
	case text == "-Infinity":
		return math.Inf(-1)
	case decimalNumber.MatchString(text):
		number, err := strconv.ParseFloat(text, 64)
		if err != nil {
			// Out of range: ParseFloat already returned ±Inf like JavaScript.
			return number
		}
		return number
	case prefixedInt.MatchString(text):
		base := map[byte]int{'x': 16, 'X': 16, 'o': 8, 'O': 8, 'b': 2, 'B': 2}[text[1]]
		number, err := strconv.ParseUint(text[2:], base, 64)
		if err != nil {
			return math.NaN()
		}
		return float64(number)
	}
	return math.NaN()
}

// IsInteger is Number.isInteger(Number(value)).
func IsInteger(value any) bool {
	number := Number(value)
	return !math.IsNaN(number) && !math.IsInf(number, 0) && number == math.Trunc(number)
}

// IsFinite is Number.isFinite(Number(value)).
func IsFinite(value any) bool {
	number := Number(value)
	return !math.IsNaN(number) && !math.IsInf(number, 0)
}

// String is JavaScript String(value) for decoded JSON values.
func String(value any) string {
	switch v := value.(type) {
	case nil:
		return "null"
	case Undefined:
		return "undefined"
	case string:
		return v
	case bool:
		return strconv.FormatBool(v)
	case float64:
		return formatNumber(v)
	case int:
		return strconv.Itoa(v)
	case []any:
		parts := make([]string, len(v))
		for i, item := range v {
			if item != nil {
				parts[i] = String(item)
			}
		}
		return strings.Join(parts, ",")
	case map[string]any:
		return "[object Object]"
	}
	return ""
}

func formatNumber(v float64) string {
	switch {
	case math.IsNaN(v):
		return "NaN"
	case math.IsInf(v, 1):
		return "Infinity"
	case math.IsInf(v, -1):
		return "-Infinity"
	case v == 0:
		return "0"
	}
	abs := math.Abs(v)
	if abs >= 1e-6 && abs < 1e21 {
		return strconv.FormatFloat(v, 'f', -1, 64)
	}
	text := strconv.FormatFloat(v, 'e', -1, 64)
	mantissa, exponent, _ := strings.Cut(text, "e")
	exponent = strings.TrimLeft(strings.TrimPrefix(exponent, "+"), "0")
	if strings.HasPrefix(exponent, "-") {
		exponent = "-" + strings.TrimLeft(exponent[1:], "0")
	} else {
		exponent = "+" + exponent
	}
	return mantissa + "e" + exponent
}

// Truthy is JavaScript truthiness for decoded JSON values.
func Truthy(value any) bool {
	switch v := value.(type) {
	case nil, Undefined:
		return false
	case bool:
		return v
	case float64:
		return v != 0 && !math.IsNaN(v)
	case string:
		return v != ""
	}
	return true
}

var (
	isoDate     = regexp.MustCompile(`^([+-]\d{6}|\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$`)
	isoDateTime = regexp.MustCompile(`^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?\s*(Z|[+-]\d{2}:?\d{2})?$`)
)

// DateParse covers the Date.parse() inputs Hono receives: ISO dates (UTC),
// ISO date-times with or without a zone (no zone means local time), and
// PocketBase's "YYYY-MM-DD HH:MM:SS.sssZ". Other inputs are NaN (ok false).
func DateParse(value any) (time.Time, bool) {
	text := String(value)
	if match := isoDate.FindStringSubmatch(text); match != nil {
		year, _ := strconv.Atoi(match[1])
		month, day := 1, 1
		if match[2] != "" {
			month, _ = strconv.Atoi(match[2])
		}
		if match[3] != "" {
			day, _ = strconv.Atoi(match[3])
		}
		return civil(year, month, day, 0, 0, 0, 0, time.UTC)
	}
	match := isoDateTime.FindStringSubmatch(text)
	if match == nil {
		return time.Time{}, false
	}
	number := func(i int) int {
		n, _ := strconv.Atoi(match[i])
		return n
	}
	millis := 0
	if match[7] != "" {
		fraction := (match[7] + "00")[:3]
		millis, _ = strconv.Atoi(fraction)
	}
	location := time.Local
	switch zone := match[8]; {
	case zone == "Z":
		location = time.UTC
	case zone != "":
		digits := strings.ReplaceAll(zone[1:], ":", "")
		hours, _ := strconv.Atoi(digits[:2])
		minutes, _ := strconv.Atoi(digits[2:])
		if hours > 23 || minutes > 59 {
			return time.Time{}, false
		}
		offset := hours*3600 + minutes*60
		if zone[0] == '-' {
			offset = -offset
		}
		location = time.FixedZone("", offset)
	}
	return civil(number(1), number(2), number(3), number(4), number(5), number(6), millis, location)
}

func civil(year, month, day, hour, minute, second, millis int, location *time.Location) (time.Time, bool) {
	if month < 1 || month > 12 || day < 1 || day > 31 || minute > 59 || second > 59 {
		return time.Time{}, false
	}
	if hour > 24 || (hour == 24 && (minute > 0 || second > 0 || millis > 0)) {
		return time.Time{}, false
	}
	return time.Date(year, time.Month(month), day, hour, minute, second, millis*int(time.Millisecond), location), true
}

// ISO is Date.prototype.toISOString().
func ISO(t time.Time) string {
	return t.UTC().Format("2006-01-02T15:04:05.000Z")
}

// Length is String.prototype.length (UTF-16 code units).
func Length(text string) int {
	return len(utf16.Encode([]rune(text)))
}

// Slice is String.prototype.slice(0, limit) in UTF-16 code units.
func Slice(text string, limit int) string {
	units := utf16.Encode([]rune(text))
	if len(units) <= limit {
		return text
	}
	return string(utf16.Decode(units[:limit]))
}
