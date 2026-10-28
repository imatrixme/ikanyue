// Package pay is the standalone payment gateway: payments, refunds, provider
// observations, durable events and statements, stored as versioned rows in an
// embedded PocketBase. Business orders, prices and credits live in kanyue.server.
package pay

import (
	"bytes"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"math"
	"regexp"
	"strconv"
	"time"
)

// Error is a gateway failure with a stable code and HTTP status.
type Error struct {
	Code   string
	Status int
	// Channel and ChannelStatus describe a signed WeChat API error.
	Channel       string
	ChannelStatus int
}

func (e *Error) Error() string { return e.Code }

func fail(code string, status int) error { return &Error{Code: code, Status: status} }

func conflict() error { return fail("CONCURRENT_CHANGE", 409) }

// codeOf returns the gateway code of err, or "" for an uncoded failure.
func codeOf(err error) string {
	var coded *Error
	if errors.As(err, &coded) {
		return coded.Code
	}
	return ""
}

func isConflict(err error) bool { return codeOf(err) == "CONCURRENT_CHANGE" }

// retry reruns an optimistic transaction a bounded number of times on version conflicts.
func retry[T any](action func() (T, error)) (T, error) {
	for attempt := 0; ; attempt++ {
		value, err := action()
		if err == nil || !isConflict(err) || attempt >= 5 {
			return value, err
		}
	}
}

func retryErr(action func() error) error {
	_, err := retry(func() (struct{}, error) { return struct{}{}, action() })
	return err
}

func jsonBytes(value any) []byte {
	var buffer bytes.Buffer
	encoder := json.NewEncoder(&buffer)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(value); err != nil {
		panic(err)
	}
	return bytes.TrimSuffix(buffer.Bytes(), []byte("\n"))
}

func digest(value any) string {
	sum := sha256.Sum256(jsonBytes(value))
	return hex.EncodeToString(sum[:])
}

// recordID matches the TypeScript gateway's ids so existing rows keep their identity.
func recordID(parts ...any) string { return digest(parts)[:15] }

// object is a JSON object that keeps key order, for digests that must match stored fingerprints.
type object []field

type field struct {
	key   string
	value any
}

func (o object) MarshalJSON() ([]byte, error) {
	var buffer bytes.Buffer
	buffer.WriteByte('{')
	for i, item := range o {
		if i > 0 {
			buffer.WriteByte(',')
		}
		buffer.Write(jsonBytes(item.key))
		buffer.WriteByte(':')
		buffer.Write(jsonBytes(item.value))
	}
	buffer.WriteByte('}')
	return buffer.Bytes(), nil
}

var textPattern = regexp.MustCompile(`^[a-zA-Z0-9_.:@-]{1,120}$`)

func text(value any, name string) (string, error) {
	if s, ok := value.(string); ok && textPattern.MatchString(s) {
		return s, nil
	}
	return "", fail("INVALID_"+name, 400)
}

// minorUnits accepts a positive integer amount in fen, at most one million yuan.
func minorUnits(value any) (int, error) {
	if amount, ok := number(value); ok && amount == math.Trunc(amount) && amount > 0 && amount <= 100_000_000 {
		return int(amount), nil
	}
	return 0, fail("INVALID_AMOUNT", 400)
}

func equalSecret(actual, expected string) bool {
	return subtle.ConstantTimeCompare([]byte(actual), []byte(expected)) == 1
}

func number(value any) (float64, bool) {
	switch v := value.(type) {
	case float64:
		return v, !math.IsNaN(v) && !math.IsInf(v, 0)
	case int:
		return float64(v), true
	case int64:
		return float64(v), true
	}
	return 0, false
}

func num(data map[string]any, key string) int {
	value, _ := number(data[key])
	return int(value)
}

func str(data map[string]any, key string) string {
	value, _ := data[key].(string)
	return value
}

func flag(data map[string]any, key string) bool {
	value, _ := data[key].(bool)
	return value
}

func mapOf(value any) map[string]any {
	result, _ := value.(map[string]any)
	return result
}

// jsString is JavaScript's String(value) for the scalar values requests carry.
func jsString(value any) string {
	switch v := value.(type) {
	case nil:
		return "undefined"
	case string:
		return v
	case bool:
		return strconv.FormatBool(v)
	case float64, int, int64:
		f, _ := number(v)
		return strconv.FormatFloat(f, 'f', -1, 64)
	}
	return string(jsonBytes(value))
}

// truthyString is String(value || "").
func truthyString(value any) string {
	switch v := value.(type) {
	case nil:
		return ""
	case string:
		return v
	case bool:
		if !v {
			return ""
		}
	case float64:
		if v == 0 {
			return ""
		}
	}
	return jsString(value)
}

const isoLayout = "2006-01-02T15:04:05.000Z"

func iso(at time.Time) string { return at.UTC().Format(isoLayout) }

func nowISO() string { return iso(time.Now()) }

func parseTime(value string) (time.Time, bool) {
	at, err := time.Parse(time.RFC3339Nano, value)
	return at, err == nil
}

var china = time.FixedZone("Asia/Shanghai", 8*3600)

// chinaDate is the China calendar day of an ISO instant, or "" when unparseable.
func chinaDate(value string) string {
	at, ok := parseTime(value)
	if !ok {
		return ""
	}
	return at.In(china).Format("2006-01-02")
}

func chinaToday() string { return time.Now().In(china).Format("2006-01-02") }
