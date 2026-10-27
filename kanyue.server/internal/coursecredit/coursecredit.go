// Package coursecredit holds the course-credit ops routes and the request
// plumbing they share with Hono's routes/courseCredits/handlers.js: business
// error envelopes with errorCode and traceId, capability checks, denial audits.
package coursecredit

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"slices"
	"strings"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/audit"
	"kanyue.server/internal/auth"
	"kanyue.server/internal/httpx"
	"kanyue.server/internal/ids"
	"kanyue.server/internal/jsx"
)

// Capabilities granted to ops users (Hono's COURSE_CREDIT_CAPABILITIES).
const (
	Academic   = "course_credit.academic"
	Audit      = "course_credit.audit"
	Finance    = "course_credit.finance"
	Guardian   = "course_credit.guardian"
	Settlement = "course_credit.settlement"
	Student    = "course_credit.student"
	Teacher    = "course_credit.teacher"
)

var (
	allCapabilities      = []string{Academic, Audit, Finance, Guardian, Settlement, Student, Teacher}
	operatorCapabilities = []string{Academic, Audit, Finance, Settlement, Teacher}
)

// authorizationErrors answer 403 and are audited as denials.
var authorizationErrors = map[string]bool{
	"COMMERCE_ORDER_FORBIDDEN":          true,
	"COURSE_CREDIT_ADMIN_REQUIRED":      true,
	"COURSE_CREDIT_CAPABILITY_REQUIRED": true,
	"COURSE_CREDIT_STUDENT_REQUIRED":    true,
	"STUDENT_LEARNING_STUDENT_REQUIRED": true,
	"SESSION_TEACHER_FORBIDDEN":         true,
	"SESSION_TEACHER_TARGET_FORBIDDEN":  true,
	"SESSION_STUDENT_FORBIDDEN":         true,
	"BOOKING_TEACHER_REQUIRED":          true,
	"APPOINTMENT_TEACHER_FORBIDDEN":     true,
	"APPOINTMENT_STUDENT_FORBIDDEN":     true,
	"APPOINTMENT_CANCEL_FORBIDDEN":      true,
	"APPOINTMENT_RESCHEDULE_FORBIDDEN":  true,
	"BOOKING_OFFERING_FORBIDDEN":        true,
	"BOOKING_OVERRIDE_FORBIDDEN":        true,
	"CALENDAR_ROLE_UNSUPPORTED":         true,
}

// Error is Hono's CourseCreditError: a business failure with a stable code.
type Error struct {
	Code    string
	Message string
	Details map[string]any
}

func (e *Error) Error() string { return e.Message }

func Fail(code, message string, details map[string]any) *Error {
	if details == nil {
		details = map[string]any{}
	}
	return &Error{Code: code, Message: message, Details: details}
}

// storeError is a non-business failure with an HTTP status: a PocketBase REST
// failure as Hono's SDK saw it (ClientResponseError), optionally tagged with the
// `error.code` a Hono service assigned before rethrowing it.
type storeError struct {
	status  int
	code    string
	message string
	details map[string]any
	cause   error
}

func (e *storeError) Error() string { return e.message }
func (e *storeError) Unwrap() error { return e.cause }

// batchFailed is how a rejected write reached Hono through the PocketBase batch API.
func batchFailed(err error) error {
	var business *Error
	var store *storeError
	if errors.As(err, &business) || errors.As(err, &store) {
		return err
	}
	return &storeError{status: 400, message: "Batch transaction failed.", cause: err}
}

// withCode is Hono's `error.code = error.code || code` on a failed write.
func withCode(err error, code string) error {
	var store *storeError
	if errors.As(err, &store) && store.code == "" {
		tagged := *store
		tagged.code = code
		return &tagged
	}
	return err
}

func HasCapability(user auth.Claims, capability string) bool {
	if !slices.Contains(allCapabilities, capability) {
		return false
	}
	role := auth.ClaimString(user, "role")
	switch role {
	case "student":
		return capability == Student
	case "guardian":
		return capability == Guardian && slices.Contains(explicitCapabilities(user), capability)
	}
	if role != "teacher" || !jsx.Truthy(user["id"]) {
		return false
	}
	if user["isAdmin"] == true {
		return slices.Contains(operatorCapabilities, capability)
	}
	return slices.Contains(explicitCapabilities(user), capability)
}

func explicitCapabilities(user auth.Claims) []string {
	values, ok := user["courseCreditCapabilities"].([]any)
	if !ok {
		values, _ = user["capabilities"].([]any)
	}
	result := []string{}
	for _, value := range values {
		if text, ok := value.(string); ok {
			result = append(result, text)
		}
	}
	return result
}

func RequireCapability(user auth.Claims, capability string) error {
	if !HasCapability(user, capability) {
		return Fail("COURSE_CREDIT_CAPABILITY_REQUIRED", "缺少课程点操作权限", map[string]any{"capability": capability})
	}
	return nil
}

func RequireAnyCapability(user auth.Claims, capabilities ...string) error {
	for _, capability := range capabilities {
		if HasCapability(user, capability) {
			return nil
		}
	}
	return Fail("COURSE_CREDIT_CAPABILITY_REQUIRED", "缺少课程运营权限", map[string]any{"capabilities": capabilities})
}

// Actor is Hono's commandMetadata: who runs a command and how it is traced.
type Actor struct {
	ID             string
	Role           string
	IdempotencyKey string
	TraceID        string
}

func actorOf(e *core.RequestEvent) Actor {
	user := auth.User(e)
	role := auth.ClaimString(user, "role")
	if user["isAdmin"] == true {
		role = "admin"
	}
	return Actor{
		ID:             auth.ClaimString(user, "id"),
		Role:           role,
		IdempotencyKey: e.Request.Header.Get("Idempotency-Key"),
		TraceID:        traceID(e),
	}
}

const traceKey = "kanyueCourseCreditTrace"

func traceID(e *core.RequestEvent) string {
	if trace, ok := e.Get(traceKey).(string); ok {
		return trace
	}
	trace := strings.TrimSpace(e.Request.Header.Get("X-Trace-Id"))
	if trace == "" {
		trace = ids.UUID()
	} else {
		trace = jsx.Slice(trace, 160)
	}
	e.Set(traceKey, trace)
	return trace
}

// Query is Hono's safeQuery.
func Query(e *core.RequestEvent, query func() (any, error)) error {
	result, err := query()
	if err != nil {
		return sendError(e, err)
	}
	return httpx.Data(e, result)
}

// Command is Hono's safeCommand: results carry operationId and traceId, and the
// named command is counted in the process metrics.
func Command(e *core.RequestEvent, name string, command func() (map[string]any, error)) error {
	result, err := defaultMetrics.measure(name, command)
	if err != nil {
		return sendError(e, err)
	}
	if result == nil {
		result = map[string]any{}
	}
	if !jsx.Truthy(result["operationId"]) {
		result["operationId"] = nil
	}
	result["traceId"] = traceID(e)
	return httpx.Data(e, result)
}

func sendError(e *core.RequestEvent, err error) error {
	status, code, message, details := 500, "COURSE_CREDIT_INTERNAL_ERROR", "服务器内部错误", map[string]any{}
	var business *Error
	var store *storeError
	switch {
	case errors.As(err, &business):
		code, message, details = business.Code, business.Message, business.Details
		status = 400
		if authorizationErrors[code] {
			status = 403
			recordDenial(e, business)
		}
	case errors.As(err, &store):
		status, message = store.status, store.message
		if store.code != "" {
			code = store.code
		}
		if store.details != nil {
			details = store.details
		}
		if store.cause != nil {
			log.Printf("%s %s: %v", e.Request.Method, e.Request.URL.Path, store.cause)
		}
	case errors.Is(err, sql.ErrNoRows):
		status, message = 404, "The requested resource wasn't found."
	default:
		log.Printf("%s %s: %v", e.Request.Method, e.Request.URL.Path, err)
	}
	operationID := details["operationId"]
	if !jsx.Truthy(operationID) {
		operationID = nil
	}
	return e.JSON(http.StatusOK, map[string]any{
		"code":        status,
		"message":     message,
		"data":        nil,
		"errorCode":   code,
		"details":     details,
		"operationId": operationID,
		"traceId":     traceID(e),
	})
}

func recordDenial(e *core.RequestEvent, err *Error) {
	user := auth.User(e)
	capability, _ := err.Details["capability"].(string)
	audit.Denied(e.App,
		&audit.Actor{ID: auth.ClaimString(user, "id"), Role: auth.ClaimString(user, "role")},
		"course_credit."+strings.ToLower(e.Request.Method),
		"course_credit_route",
		e.Request.URL.Path,
		map[string]any{"capability": capability, "errorCode": err.Code, "traceId": traceID(e)},
	)
}

// Body is a JSON object with its keys in request order (Object.keys order).
type Body struct {
	Values map[string]any
	Keys   []string
}

func (b Body) Get(key string) any { return jsx.Get(b.Values, key) }

// readJSONBody is Hono's readJsonBody: the body must be a JSON object regardless of content type.
func readJSONBody(e *core.RequestEvent) (Body, error) {
	raw, err := io.ReadAll(e.Request.Body)
	if err != nil {
		return Body{}, Fail("INVALID_JSON_BODY", "请求体必须是有效的 JSON 对象", nil)
	}
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return Body{}, Fail("INVALID_JSON_BODY", "请求体必须是有效的 JSON 对象", nil)
	}
	object, ok := value.(map[string]any)
	if !ok {
		return Body{}, Fail("INVALID_JSON_BODY", "请求体必须是 JSON 对象", nil)
	}
	return Body{Values: object, Keys: objectKeys(raw)}, nil
}

// objectKeys lists a JSON object's top-level keys in order, last duplicate winning like JSON.parse.
func objectKeys(raw []byte) []string {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	if _, err := decoder.Token(); err != nil {
		return nil
	}
	keys := []string{}
	for decoder.More() {
		token, err := decoder.Token()
		if err != nil {
			return keys
		}
		key, _ := token.(string)
		var skip json.RawMessage
		if err := decoder.Decode(&skip); err != nil {
			return keys
		}
		if !slices.Contains(keys, key) {
			keys = append(keys, key)
		}
	}
	return keys
}

// queryParams is Hono's queryParams: only listed names, absent ones omitted.
func queryParams(e *core.RequestEvent, names ...string) map[string]string {
	values := e.Request.URL.Query()
	result := map[string]string{}
	for _, name := range names {
		if value, ok := values[name]; ok && len(value) > 0 {
			result[name] = value[0]
		}
	}
	return result
}
