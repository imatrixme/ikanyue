package coursecredit

import (
	"crypto/sha256"
	"encoding/hex"
	"math"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode/utf16"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/ids"
	"kanyue.server/internal/jsx"
	"kanyue.server/internal/records"
)

// Shared pieces of Hono's ledger commands: idempotent replay, request
// fingerprints, operation audit summaries and the records every command writes.

const dayMillis = 86400000

// clock is Date.now(): millisecond precision.
func clock() time.Time {
	return time.Now().UTC().Truncate(time.Millisecond)
}

func iso(t time.Time) string { return jsx.ISO(t) }

// millis is Date.parse for ISO strings the ledger wrote itself.
func millis(value any) (int64, bool) {
	parsed, ok := jsx.DateParse(value)
	if !ok {
		return 0, false
	}
	return parsed.UnixMilli(), true
}

func fromMillis(ms int64) string { return iso(time.UnixMilli(ms)) }

// addDays is Hono's addDays over an ISO timestamp.
func addDays(value string, days float64) string {
	ms, _ := millis(value)
	return fromMillis(ms + int64(days*dayMillis))
}

// filterTime renders a time literal the way PocketBase stores dates
// ("YYYY-MM-DD HH:MM:SS.sssZ") so text comparison orders correctly.
func filterTime(value any) string {
	if ms, ok := millis(value); ok {
		return strings.Replace(fromMillis(ms), "T", " ", 1)
	}
	if value == nil {
		return ""
	}
	return jsx.String(value)
}

func operationNo(prefix string, at time.Time, id string) string {
	return prefix + "-" + strconv.FormatInt(at.UnixMilli(), 10) + "-" + id
}

// isInt is Number.isInteger without coercion.
func isInt(value any) bool {
	number, ok := value.(float64)
	return ok && !math.IsInf(number, 0) && number == math.Trunc(number)
}

// textValue is `typeof value === 'string' && value.trim()`.
func textValue(value any) (string, bool) {
	text, ok := value.(string)
	return text, ok && strings.TrimSpace(text) != ""
}

func scopedIdempotencyKey(scope string, key any) (string, error) {
	text, ok := textValue(key)
	if !ok {
		return "", Fail("IDEMPOTENCY_KEY_REQUIRED", "idempotency key is required", nil)
	}
	return scope + ":" + strings.TrimSpace(text), nil
}

// fingerprint is sha256(stableJson(request)).
func fingerprint(value any) string {
	sum := sha256.Sum256([]byte(stableJSON(value)))
	return hex.EncodeToString(sum[:])
}

// stableJSON is Hono's stableJson: sorted keys, undefined rendered literally.
func stableJSON(value any) string {
	switch v := value.(type) {
	case []any:
		parts := make([]string, len(v))
		for i, item := range v {
			parts[i] = stableJSON(item)
		}
		return "[" + strings.Join(parts, ",") + "]"
	case []string:
		parts := make([]string, len(v))
		for i, item := range v {
			parts[i] = quoteJSON(item)
		}
		return "[" + strings.Join(parts, ",") + "]"
	case map[string]any:
		keys := make([]string, 0, len(v))
		for key := range v {
			keys = append(keys, key)
		}
		slices.SortFunc(keys, compareUTF16)
		parts := make([]string, len(keys))
		for i, key := range keys {
			parts[i] = quoteJSON(key) + ":" + stableJSON(v[key])
		}
		return "{" + strings.Join(parts, ",") + "}"
	}
	return scalarJSON(value)
}

// scalarJSON is JSON.stringify for primitives (undefined → "undefined" in a template).
func scalarJSON(value any) string {
	switch v := value.(type) {
	case jsx.Undefined:
		return "undefined"
	case nil:
		return "null"
	case string:
		return quoteJSON(v)
	case bool:
		return strconv.FormatBool(v)
	case float64:
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return "null"
		}
		return jsx.String(v)
	case int:
		return strconv.Itoa(v)
	}
	return jsx.String(value)
}

// quoteJSON quotes like JSON.stringify (no HTML or U+2028 escaping).
func quoteJSON(text string) string {
	var b strings.Builder
	b.WriteByte('"')
	for _, r := range text {
		switch r {
		case '"':
			b.WriteString(`\"`)
		case '\\':
			b.WriteString(`\\`)
		case '\b':
			b.WriteString(`\b`)
		case '\f':
			b.WriteString(`\f`)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\t':
			b.WriteString(`\t`)
		default:
			if r < 0x20 {
				b.WriteString(`\u00`)
				b.WriteString(strconv.FormatInt(int64(r)>>4, 16))
				b.WriteString(strconv.FormatInt(int64(r)&0xf, 16))
				continue
			}
			b.WriteRune(r)
		}
	}
	b.WriteByte('"')
	return b.String()
}

// compareUTF16 orders strings like JavaScript's default sort.
func compareUTF16(a, b string) int {
	return slices.Compare(utf16.Encode([]rune(a)), utf16.Encode([]rune(b)))
}

// replay returns the stored result of an idempotent command, or nil when it never ran.
func replay(app core.App, scopedKey, requestHash, conflict string) (map[string]any, error) {
	existing, err := findFirst(app, "credit_operations", `idempotencyKey="`+records.EscapeFilter(scopedKey)+`"`)
	if err != nil || existing == nil {
		return nil, err
	}
	snapshot, _ := existing["requestSnapshot"].(map[string]any)
	if stored, ok := snapshot["requestHash"].(string); !ok || stored != requestHash {
		return nil, Fail("IDEMPOTENCY_CONFLICT", conflict, nil)
	}
	result := map[string]any{}
	if stored, ok := existing["resultSnapshot"].(map[string]any); ok {
		for key, value := range stored {
			result[key] = value
		}
	}
	result["replayed"] = true
	return result, nil
}

const replayConflict = "Idempotency key conflicts with another request"

// commitOrReplay sends a plan; a failure that a concurrent identical command
// explains returns that command's result instead.
func commitOrReplay(app core.App, plan []step, scopedKey, requestHash, conflict, code string, result map[string]any) (map[string]any, error) {
	if err := send(app, plan); err != nil {
		raced, replayErr := replay(app, scopedKey, requestHash, conflict)
		if replayErr != nil {
			return nil, replayErr
		}
		if raced != nil {
			return raced, nil
		}
		return nil, withCode(err, code)
	}
	result["replayed"] = false
	return result, nil
}

var sensitiveKey = regexp.MustCompile(`(?i)(cellphone|phone|email|name|address|token|password|secret|payload|metadata|openid|unionid)`)

const maxSummaryText = 160

// operationAudit is Hono's operationAudit: privacy-safe before/after summaries.
func operationAudit(reason any, before, after any) map[string]any {
	return map[string]any{
		"reason":        normalizeReason(reason),
		"outcome":       "committed",
		"beforeSummary": privacySafeSummary(before, 0),
		"afterSummary":  privacySafeSummary(after, 0),
	}
}

func normalizeReason(value any) string {
	if text, ok := textValue(value); ok {
		return jsx.Slice(strings.TrimSpace(text), maxSummaryText)
	}
	return "business_command"
}

func privacySafeSummary(value any, depth int) map[string]any {
	summary := map[string]any{}
	if depth > 2 {
		return summary
	}
	entries, ok := value.(map[string]any)
	if !ok {
		return summary
	}
	for key, nested := range entries {
		if _, undefined := nested.(jsx.Undefined); undefined || sensitiveKey.MatchString(key) {
			continue
		}
		switch v := nested.(type) {
		case []any:
			summary[key+"Count"] = len(v)
		case []map[string]any:
			summary[key+"Count"] = len(v)
		case []string:
			summary[key+"Count"] = len(v)
		case map[string]any:
			if child := privacySafeSummary(v, depth+1); len(child) > 0 {
				summary[key] = child
			}
		case string:
			summary[key] = jsx.Slice(v, maxSummaryText)
		default:
			summary[key] = nested
		}
	}
	return summary
}

var bucketNames = []string{"availableQuantity", "frozenQuantity", "consumedQuantity", "expiredQuantity", "reversedQuantity"}

func balanceSnapshot(batch map[string]any) map[string]any {
	snapshot := map[string]any{"originalQuantity": batch["originalQuantity"]}
	for _, bucket := range bucketNames {
		snapshot[bucket] = batch[bucket]
	}
	return snapshot
}

func versionClaim(entityType, entityID string, expectedVersion int, operationID string) step {
	return create("credit_version_claims", map[string]any{
		"id": ids.Record(), "entityType": entityType, "entityId": entityID,
		"expectedVersion": expectedVersion, "operationId": operationID,
	})
}

func outbox(topic, aggregateType, aggregateID string, payload any) step {
	return create("outbox_events", map[string]any{
		"id": ids.Record(), "topic": topic, "aggregateType": aggregateType, "aggregateId": aggregateID,
		"payload": payload, "status": "pending", "attempts": 0,
	})
}

func copyMap(value map[string]any) map[string]any {
	result := make(map[string]any, len(value))
	for key, item := range value {
		result[key] = item
	}
	return result
}

// actorRoleOr is `input.actorRole || fallback`.
func actorRoleOr(actor Actor, fallback string) string {
	if actor.Role != "" {
		return actor.Role
	}
	return fallback
}
