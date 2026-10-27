package httpx

import (
	"encoding/json"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

// Body is a request payload decoded like Hono's readRequestBody: JSON when the
// content type says so, otherwise form fields as strings.
type Body map[string]any

// ReadBody returns an empty body for malformed JSON, as Hono's ops handlers do.
func ReadBody(e *core.RequestEvent) Body {
	body := Body{}
	if strings.Contains(e.Request.Header.Get("Content-Type"), "application/json") {
		if err := json.NewDecoder(e.Request.Body).Decode(&body); err != nil || body == nil {
			return Body{}
		}
		return body
	}
	if err := e.Request.ParseMultipartForm(32 << 20); err != nil {
		_ = e.Request.ParseForm()
	}
	for key, values := range e.Request.PostForm {
		if len(values) > 0 {
			body[key] = values[0]
		}
	}
	return body
}

// String returns a string field or "" (numbers and other types are not coerced).
func (b Body) String(key string) string {
	value, _ := b[key].(string)
	return value
}

// Text mirrors JS `${value}` for scalar fields, used where Hono interpolates input.
func (b Body) Text(key string) string {
	switch value := b[key].(type) {
	case string:
		return value
	case float64, bool:
		raw, _ := json.Marshal(value)
		return string(raw)
	default:
		return ""
	}
}

func (b Body) Has(key string) bool {
	_, ok := b[key]
	return ok
}
