package plugin

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"regexp"
	"sort"
	"strings"
)

// Validate checks value against the JSON Schema subset plugin schemas use:
// type, properties, required, additionalProperties: false, items, enum,
// minimum, maximum, minLength, maxLength, maxItems and pattern. The console
// renders forms from the same keywords, so what it offers is what publishing accepts.
func Validate(schema map[string]any, value any) error {
	var errs []string
	validate(schema, value, "config", &errs)
	if len(errs) == 0 {
		return nil
	}
	return errors.New(strings.Join(errs, "; "))
}

func validate(schema map[string]any, value any, path string, errs *[]string) {
	fail := func(format string, args ...any) { *errs = append(*errs, path+": "+fmt.Sprintf(format, args...)) }
	if enum, ok := schema["enum"].([]any); ok && !contains(enum, value) {
		fail("must be one of %v", enum)
		return
	}
	switch schema["type"] {
	case "object":
		object, ok := value.(map[string]any)
		if !ok {
			fail("must be an object")
			return
		}
		properties, _ := schema["properties"].(map[string]any)
		for _, name := range asStrings(schema["required"]) {
			if _, ok := object[name]; !ok {
				fail("%s is required", name)
			}
		}
		keys := make([]string, 0, len(object))
		for key := range object {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		for _, key := range keys {
			property, known := properties[key].(map[string]any)
			if !known {
				if additional, ok := schema["additionalProperties"].(map[string]any); ok {
					validate(additional, object[key], path+"."+key, errs)
				} else if schema["additionalProperties"] == false {
					fail("unknown field %s", key)
				}
				continue
			}
			validate(property, object[key], path+"."+key, errs)
		}
	case "array":
		array, ok := value.([]any)
		if !ok {
			fail("must be a list")
			return
		}
		if limit, ok := number(schema["maxItems"]); ok && float64(len(array)) > limit {
			fail("must have at most %v items", limit)
		}
		if items, ok := schema["items"].(map[string]any); ok {
			for i, item := range array {
				validate(items, item, fmt.Sprintf("%s[%d]", path, i), errs)
			}
		}
	case "string":
		text, ok := value.(string)
		if !ok {
			fail("must be a string")
			return
		}
		length := float64(len([]rune(text)))
		if limit, ok := number(schema["minLength"]); ok && length < limit {
			fail("must be at least %v characters", limit)
		}
		if limit, ok := number(schema["maxLength"]); ok && length > limit {
			fail("must be at most %v characters", limit)
		}
		if pattern, ok := schema["pattern"].(string); ok && !regexp.MustCompile(pattern).MatchString(text) {
			fail("must match %s", pattern)
		}
	case "integer", "number":
		n, ok := value.(float64)
		if !ok {
			fail("must be a number")
			return
		}
		if schema["type"] == "integer" && n != math.Trunc(n) {
			fail("must be a whole number")
		}
		if limit, ok := number(schema["minimum"]); ok && n < limit {
			fail("must be at least %v", limit)
		}
		if limit, ok := number(schema["maximum"]); ok && n > limit {
			fail("must be at most %v", limit)
		}
	case "boolean":
		if _, ok := value.(bool); !ok {
			fail("must be true or false")
		}
	}
}

func contains(values []any, value any) bool {
	for _, candidate := range values {
		if candidate == value {
			return true
		}
	}
	return false
}

func asStrings(value any) []string {
	list, _ := value.([]any)
	out := make([]string, 0, len(list))
	for _, item := range list {
		if text, ok := item.(string); ok {
			out = append(out, text)
		}
	}
	return out
}

func number(value any) (float64, bool) {
	n, ok := value.(float64)
	return n, ok
}

func strictDecode(raw json.RawMessage, target any) error {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return fmt.Errorf("config: %w", err)
	}
	return nil
}
