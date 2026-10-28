package control

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"kanyue.gateway/internal/plugin"
	"kanyue.gateway/internal/schema"
)

const manifestLimit = 4 << 20

// anyMethod is the path item key services use for routes that accept every method;
// OpenAPI has no such method, so it travels as an extension.
const anyMethod = "x-kanyue-any"

var openAPIMethods = map[string]string{"get": "GET", "put": "PUT", "post": "POST", "delete": "DELETE",
	"options": "OPTIONS", "head": "HEAD", "patch": "PATCH", "trace": "TRACE", anyMethod: ""}

type manifestOperation struct {
	Method      string
	Path        string
	Module      string              `json:"x-kanyue-module"`
	Auth        string              `json:"x-kanyue-auth"`
	Idempotent  bool                `json:"x-kanyue-idempotent"`
	Parameters  []manifestParameter `json:"parameters"`
	RequestBody *struct {
		Required bool `json:"required"`
		Content  map[string]struct {
			Schema map[string]any `json:"schema"`
		} `json:"content"`
	} `json:"requestBody"`
	// Request is what request-validation checks, built from the parameters and the JSON body.
	Request *plugin.RequestSchema `json:"-"`
}

type manifestParameter struct {
	Name     string         `json:"name"`
	In       string         `json:"in"`
	Required bool           `json:"required"`
	Schema   map[string]any `json:"schema"`
}

// requestOf keeps the query and header parameters, the operation's overriding
// the path item's, and the application/json body schema.
func requestOf(shared []manifestParameter, op manifestOperation) *plugin.RequestSchema {
	request := &plugin.RequestSchema{}
	seen := map[string]bool{}
	for _, p := range append(op.Parameters, shared...) {
		key := p.In + "\x00" + p.Name
		if seen[key] || p.Name == "" {
			continue
		}
		seen[key] = true
		parameter := plugin.Parameter{Name: p.Name, Required: p.Required, Schema: p.Schema}
		switch p.In {
		case "query":
			request.Query = append(request.Query, parameter)
		case "header":
			request.Header = append(request.Header, parameter)
		}
	}
	if op.RequestBody != nil {
		for media, content := range op.RequestBody.Content {
			if strings.HasPrefix(media, "application/json") && content.Schema != nil {
				request.Body = &plugin.BodySchema{Required: op.RequestBody.Required, Schema: content.Schema}
			}
		}
	}
	if request.Empty() {
		return nil
	}
	return request
}

// ParseManifest reads the operations of an OpenAPI 3.1 document produced by a service.
func ParseManifest(raw []byte) ([]manifestOperation, error) {
	var doc struct {
		OpenAPI string                                `json:"openapi"`
		Paths   map[string]map[string]json.RawMessage `json:"paths"`
	}
	if err := json.Unmarshal(raw, &doc); err != nil {
		return nil, fmt.Errorf("manifest is not JSON: %w", err)
	}
	if !strings.HasPrefix(doc.OpenAPI, "3.") {
		return nil, errors.New("manifest is not an OpenAPI 3 document")
	}
	var ops []manifestOperation
	for path, item := range doc.Paths {
		if !strings.HasPrefix(path, "/") {
			return nil, fmt.Errorf("manifest path %q must start with /", path)
		}
		var shared []manifestParameter
		if raw, ok := item["parameters"]; ok {
			if err := json.Unmarshal(raw, &shared); err != nil {
				return nil, fmt.Errorf("manifest parameters of %s: %w", path, err)
			}
		}
		for key, value := range item {
			method, ok := openAPIMethods[key]
			if !ok {
				continue // parameters, summary and other path item fields
			}
			op := manifestOperation{Method: method, Path: path}
			if err := json.Unmarshal(value, &op); err != nil {
				return nil, fmt.Errorf("manifest operation %s %s: %w", key, path, err)
			}
			op.Request = requestOf(shared, op)
			ops = append(ops, op)
		}
	}
	return ops, nil
}

func (c *Control) syncInBackground(serviceID, address string) {
	if _, busy := c.syncing.LoadOrStore(serviceID, true); busy {
		return
	}
	go func() {
		defer c.syncing.Delete(serviceID)
		if err := c.SyncManifest(context.Background(), serviceID, address); err != nil {
			c.app.Logger().Warn("Manifest sync failed", "service", serviceID, "error", err.Error())
		}
	}()
}

// SyncManifest pulls a service's manifest from one of its instances: new
// operations become pending, missing ones are marked removed and reported,
// and nothing that a route uses is deleted.
func (c *Control) SyncManifest(ctx context.Context, serviceID, address string) error {
	service, err := c.app.FindRecordById(schema.Services, serviceID)
	if err != nil {
		return err
	}
	path := service.GetString("manifestPath")
	if path == "" {
		path = defaultManifest
	}
	raw, err := c.fetch(ctx, "http://"+address+path)
	var ops []manifestOperation
	if err == nil {
		ops, err = ParseManifest(raw)
	}
	if err != nil {
		service.Set("manifestError", truncate(err.Error(), 500))
		return errors.Join(err, c.app.Save(service))
	}
	sum := sha256.Sum256(raw)
	hash := hex.EncodeToString(sum[:])

	var removed []string
	err = c.app.RunInTransaction(func(txApp core.App) error {
		collection, err := txApp.FindCollectionByNameOrId(schema.Operations)
		if err != nil {
			return err
		}
		existing, err := txApp.FindAllRecords(schema.Operations, dbx.HashExp{"service": serviceID})
		if err != nil {
			return err
		}
		known := map[string]*core.Record{}
		for _, record := range existing {
			known[record.GetString("method")+" "+record.GetString("path")] = record
		}
		for _, op := range ops {
			key := op.Method + " " + op.Path
			record := known[key]
			delete(known, key)
			if record == nil {
				record = core.NewRecord(collection)
				record.Load(map[string]any{"service": serviceID, "method": op.Method, "path": op.Path, "status": "pending"})
			} else if record.GetString("status") == "removed" {
				record.Set("status", "pending")
			}
			record.Load(map[string]any{"module": op.Module, "auth": op.Auth, "idempotent": op.Idempotent, "request": op.Request})
			if err := txApp.Save(record); err != nil {
				return err
			}
		}
		for key, record := range known {
			if record.GetString("status") == "removed" {
				continue
			}
			record.Set("status", "removed")
			if err := txApp.Save(record); err != nil {
				return err
			}
			removed = append(removed, key)
		}
		service.Load(map[string]any{"manifestHash": hash, "manifestError": ""})
		return txApp.Save(service)
	})
	if err != nil {
		return err
	}
	if len(removed) > 0 {
		c.app.Logger().Warn("Operations removed from manifest; routes using them fail to publish until updated",
			"service", service.GetString("name"), "operations", removed)
	}
	return nil
}

func (c *Control) fetch(ctx context.Context, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	res, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("manifest answered %d", res.StatusCode)
	}
	raw, err := io.ReadAll(io.LimitReader(res.Body, manifestLimit+1))
	if err == nil && len(raw) > manifestLimit {
		err = errors.New("manifest too large")
	}
	return raw, err
}

func truncate(value string, limit int) string {
	if len(value) <= limit {
		return value
	}
	return value[:limit]
}
