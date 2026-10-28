package migrations

import (
	"database/sql"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

// baseline.json is the business schema Hono's pb_migrations and ensure scripts
// built, exported from an initialized local database. Relation targets are
// stored as "@collection_name" because collection ids differ between databases;
// auth token secrets are left out so each database generates its own.
//
//go:embed baseline.json
var baselineJSON []byte

// ensureBaseline makes an empty database complete and only ever adds to an
// existing one: missing collections are created, missing fields and indexes are
// appended, and nothing present is changed or dropped.
func ensureBaseline(txApp core.App) error {
	var items []map[string]any
	if err := json.Unmarshal(baselineJSON, &items); err != nil {
		return err
	}

	// Pass 1: create missing collections without relations or indexes, which
	// may point at collections created later in this pass.
	created := map[string]bool{}
	for _, item := range items {
		name := item["name"].(string)
		_, err := txApp.FindCollectionByNameOrId(name)
		if err == nil {
			continue
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		collection := core.NewCollection(item["type"].(string), name)
		shell := map[string]any{}
		for key, value := range item {
			if key != "fields" && key != "indexes" {
				shell[key] = value
			}
		}
		if err := unmarshalInto(collection, shell); err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
		if err := txApp.Save(collection); err != nil {
			return fmt.Errorf("create %s: %w", name, err)
		}
		created[name] = true
	}

	// Pass 2: append missing fields and indexes by name to every collection.
	for _, item := range items {
		name := item["name"].(string)
		collection, err := txApp.FindCollectionByNameOrId(name)
		if err != nil {
			return err
		}
		changed := false
		for _, raw := range item["fields"].([]any) {
			field := raw.(map[string]any)
			if hasField(collection, field["name"].(string)) {
				continue
			}
			if target, ok := field["collectionId"].(string); ok && strings.HasPrefix(target, "@") {
				related, err := txApp.FindCollectionByNameOrId(strings.TrimPrefix(target, "@"))
				if err != nil {
					return fmt.Errorf("%s.%s: %w", name, field["name"], err)
				}
				field["collectionId"] = related.Id
			}
			decoded, err := decodeField(field)
			if err != nil {
				return fmt.Errorf("%s.%s: %w", name, field["name"], err)
			}
			collection.Fields.Add(decoded)
			changed = true
		}
		for _, raw := range item["indexes"].([]any) {
			index := raw.(string)
			if indexNamed(collection, indexName(index)) || indexDefined(collection, index) {
				continue
			}
			collection.Indexes = append(collection.Indexes, index)
			changed = true
		}
		if changed || created[name] {
			if err := txApp.Save(collection); err != nil {
				return fmt.Errorf("extend %s: %w", name, err)
			}
		}
	}
	return nil
}

func unmarshalInto(target any, value map[string]any) error {
	raw, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return json.Unmarshal(raw, target)
}

func decodeField(field map[string]any) (core.Field, error) {
	raw, err := json.Marshal([]any{field})
	if err != nil {
		return nil, err
	}
	var fields core.FieldsList
	if err := json.Unmarshal(raw, &fields); err != nil {
		return nil, err
	}
	return fields[0], nil
}

// indexName reads the name from "CREATE [UNIQUE] INDEX `name` ON ...".
func indexName(index string) string {
	parts := strings.Fields(index)
	for i, part := range parts {
		if strings.EqualFold(part, "INDEX") && i+1 < len(parts) {
			next := parts[i+1]
			if strings.EqualFold(next, "IF") && i+4 < len(parts) {
				next = parts[i+4]
			}
			return strings.Trim(next, "`\"[]")
		}
	}
	return index
}

// hasField matches case-insensitively, as SQLite columns and PocketBase field names do.
func hasField(collection *core.Collection, name string) bool {
	for _, field := range collection.Fields {
		if strings.EqualFold(field.GetName(), name) {
			return true
		}
	}
	return false
}

// indexDefined reports an existing index with the same definition under another name.
func indexDefined(collection *core.Collection, index string) bool {
	for _, existing := range collection.Indexes {
		if indexBody(existing) == indexBody(index) {
			return true
		}
	}
	return false
}

// indexBody is the definition without its name, quoting, case or spacing.
func indexBody(index string) string {
	body := strings.Replace(index, indexName(index), "", 1)
	body = strings.NewReplacer("`", "", `"`, "", "[", "", "]", "", "IF NOT EXISTS", "").Replace(body)
	return strings.ToLower(strings.Join(strings.Fields(body), " "))
}

func indexNamed(collection *core.Collection, name string) bool {
	for _, existing := range collection.Indexes {
		if strings.EqualFold(indexName(existing), name) {
			return true
		}
	}
	return false
}
