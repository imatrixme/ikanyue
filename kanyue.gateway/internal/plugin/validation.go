package plugin

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"strconv"
	"strings"
)

func init() {
	register(requestValidation)
}

// RequestSchema is what an operation's OpenAPI document says a request carries:
// its query and header parameters and its JSON body.
type RequestSchema struct {
	Query  []Parameter `json:"query,omitempty"`
	Header []Parameter `json:"header,omitempty"`
	Body   *BodySchema `json:"body,omitempty"`
}

type Parameter struct {
	Name     string         `json:"name"`
	Required bool           `json:"required,omitempty"`
	Schema   map[string]any `json:"schema,omitempty"`
}

type BodySchema struct {
	Required bool           `json:"required,omitempty"`
	Schema   map[string]any `json:"schema,omitempty"`
}

// Empty is true when there is nothing to check.
func (r *RequestSchema) Empty() bool {
	return r == nil || len(r.Query) == 0 && len(r.Header) == 0 && r.Body == nil
}

// request-validation rejects requests that do not match the operation's
// request schema, before they reach the service. Keywords outside the subset
// Validate knows are not checked; $ref is refused so nothing passes unchecked
// by accident.
var requestValidation = define("request-validation", 650, `{"type":"object","additionalProperties":false,"properties":{
	"maxBodyBytes":{"type":"integer","minimum":1,"maximum":16777216}}}`,
	func(c struct {
		MaxBodyBytes int64 `json:"maxBodyBytes"`
	}, scope Scope) (Instance, error) {
		if scope.Request.Empty() {
			return nil, errors.New("the operation's manifest declares no request schema to validate against")
		}
		raw, _ := json.Marshal(scope.Request)
		if bytes.Contains(raw, []byte(`"$ref"`)) {
			return nil, errors.New("the request schema uses $ref; the service must inline its schemas")
		}
		if c.MaxBodyBytes == 0 {
			c.MaxBodyBytes = 1 << 20
		}
		return &validator{schema: scope.Request, max: c.MaxBodyBytes}, nil
	})

type validator struct {
	schema *RequestSchema
	max    int64
}

func invalid(errs []string) *Reply {
	reason := strings.Join(errs, "; ")
	if len(reason) > 300 {
		reason = reason[:300]
	}
	return Fail(http.StatusBadRequest, "请求参数不合法", "Invalid Parameter: "+reason)
}

func (v *validator) Request(ctx *Context) *Reply {
	var errs []string
	query := ctx.Request.URL.Query()
	for _, p := range v.schema.Query {
		errs = checkParameter(p, "query", query[p.Name], errs)
	}
	for _, p := range v.schema.Header {
		errs = checkParameter(p, "header", ctx.Request.Header.Values(p.Name), errs)
	}
	if v.schema.Body != nil {
		reply, bodyErrs := v.checkBody(ctx.Request)
		if reply != nil {
			return reply
		}
		errs = append(errs, bodyErrs...)
	}
	if len(errs) > 0 {
		return invalid(errs)
	}
	return nil
}

// checkParameter converts the raw values to the schema's type, as OpenAPI's
// form style does, and validates them.
func checkParameter(p Parameter, in string, values []string, errs []string) []string {
	path := in + "." + p.Name
	if len(values) == 0 {
		if p.Required {
			errs = append(errs, path+": is required")
		}
		return errs
	}
	var value any
	if p.Schema["type"] == "array" {
		items, _ := p.Schema["items"].(map[string]any)
		var list []any
		for _, raw := range values {
			for _, part := range strings.Split(raw, ",") {
				list = append(list, convert(items, part))
			}
		}
		value = list
	} else {
		value = convert(p.Schema, values[0])
	}
	var found []string
	validate(p.Schema, value, path, &found)
	return append(errs, found...)
}

// convert reads a parameter as its schema's type; a value that does not parse
// stays a string, so validation reports the type.
func convert(schema map[string]any, raw string) any {
	switch schema["type"] {
	case "integer", "number":
		if n, err := strconv.ParseFloat(raw, 64); err == nil {
			return n
		}
	case "boolean":
		if b, err := strconv.ParseBool(raw); err == nil {
			return b
		}
	}
	return raw
}

// checkBody reads the body, at most max bytes, validates it and puts it back
// so the upstream and a retry still receive it.
func (v *validator) checkBody(r *http.Request) (*Reply, []string) {
	if r.ContentLength > v.max {
		return TooLarge, nil
	}
	var raw []byte
	if r.Body != nil && r.Body != http.NoBody {
		var err error
		raw, err = io.ReadAll(io.LimitReader(r.Body, v.max+1))
		r.Body.Close()
		if err != nil {
			var tooLarge *http.MaxBytesError
			if errors.As(err, &tooLarge) {
				return TooLarge, nil
			}
			return Fail(http.StatusBadRequest, "请求内容不完整", "Request body unreadable"), nil
		}
		if int64(len(raw)) > v.max {
			return TooLarge, nil
		}
		r.Body, r.ContentLength = io.NopCloser(bytes.NewReader(raw)), int64(len(raw))
		r.GetBody = func() (io.ReadCloser, error) { return io.NopCloser(bytes.NewReader(raw)), nil }
	}
	if len(bytes.TrimSpace(raw)) == 0 {
		if v.schema.Body.Required {
			return nil, []string{"body: is required"}
		}
		return nil, nil
	}
	if media, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type")); media != "application/json" {
		return nil, []string{fmt.Sprintf("body: must be application/json, not %q", media)}
	}
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, []string{"body: is not valid JSON"}
	}
	var errs []string
	validate(v.schema.Body.Schema, value, "body", &errs)
	return nil, errs
}
