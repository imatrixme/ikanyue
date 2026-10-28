// Package gatewaylink tells kanyue.gateway about this service: an internal-only
// OpenAPI manifest built from the router itself, and a heartbeat that registers
// this instance. kanyue.server and kanyue.pay carry identical copies of this
// file; the manifest and heartbeat JSON are the contract with the gateway.
package gatewaylink

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"reflect"
	"runtime/debug"
	"strings"
	"sync"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/router"
)

// ManifestPath is where the gateway pulls the manifest from.
const ManifestPath = "/internal/gateway/manifest"

// Route is one registered ServeMux pattern; Method is empty for any-method routes.
type Route struct {
	Method string
	Path   string
}

func (r Route) Pattern() string {
	if r.Method == "" {
		return r.Path
	}
	return r.Method + " " + r.Path
}

// Routes lists every route registered on r, including group prefixes. PocketBase
// keeps its route tree private, so this reads it by reflection; the error
// surfaces at startup and in tests if an upgrade changes that shape.
func Routes(r *router.Router[*core.RequestEvent]) ([]Route, error) {
	var routes []Route
	err := walk(reflect.ValueOf(r.RouterGroup).Elem(), "", &routes)
	return routes, err
}

func walk(group reflect.Value, prefix string, routes *[]Route) error {
	children := group.FieldByName("children")
	if !children.IsValid() || children.Kind() != reflect.Slice {
		return errors.New("gatewaylink: PocketBase router layout changed; routes cannot be listed")
	}
	prefix += group.FieldByName("Prefix").String()
	for i := 0; i < children.Len(); i++ {
		child := children.Index(i).Elem().Elem()
		if child.FieldByName("children").IsValid() {
			if err := walk(child, prefix, routes); err != nil {
				return err
			}
			continue
		}
		*routes = append(*routes, Route{Method: child.FieldByName("Method").String(), Path: prefix + child.FieldByName("Path").String()})
	}
	return nil
}

// Operation is a route as published to the gateway.
type Operation struct {
	Route
	Module string
	Auth   string
}

// Manifest renders operations as OpenAPI 3.1. Paths are the ServeMux patterns
// themselves; any-method routes use the x-kanyue-any key. Output is
// deterministic, so its hash changes only when the routes or version do.
func Manifest(title, version string, ops []Operation) []byte {
	paths := map[string]map[string]any{}
	for _, op := range ops {
		key := strings.ToLower(op.Method)
		if key == "" {
			key = "x-kanyue-any"
		}
		if paths[op.Path] == nil {
			paths[op.Path] = map[string]any{}
		}
		safe := op.Method == http.MethodGet || op.Method == http.MethodHead || op.Method == http.MethodOptions
		paths[op.Path][key] = map[string]any{"operationId": key + " " + op.Path, "x-kanyue-module": op.Module,
			"x-kanyue-auth": op.Auth, "x-kanyue-idempotent": safe}
	}
	doc := map[string]any{"openapi": "3.1.0", "info": map[string]any{"title": title, "version": version}, "paths": paths}
	raw, _ := json.Marshal(doc)
	return raw
}

// Hash is the manifest fingerprint the gateway compares heartbeats against.
func Hash(manifest []byte) string {
	sum := sha256.Sum256(manifest)
	return hex.EncodeToString(sum[:])
}

// ManifestHandler serves the manifest to internal callers and 404s everyone else.
func ManifestHandler(manifest []byte, internal func(*http.Request) bool) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		if !internal(e.Request) {
			return e.JSON(http.StatusNotFound, map[string]any{"code": 404, "message": "接口不存在", "data": nil})
		}
		e.Response.Header().Set("Content-Type", "application/json")
		e.Response.WriteHeader(http.StatusOK)
		_, err := e.Response.Write(manifest)
		return err
	}
}

// IsInternal is true for direct calls from loopback or private addresses that
// did not pass through a reverse proxy.
func IsInternal(r *http.Request) bool {
	if r.Header.Get("X-Forwarded-For") != "" || r.Header.Get("X-Real-IP") != "" || r.Header.Get("Forwarded") != "" {
		return false
	}
	addr, err := netip.ParseAddrPort(r.RemoteAddr)
	return err == nil && (addr.Addr().IsLoopback() || addr.Addr().IsPrivate())
}

// Version is the VCS revision the binary was built from, or "dev".
func Version() string {
	if info, ok := debug.ReadBuildInfo(); ok {
		for _, setting := range info.Settings {
			if setting.Key == "vcs.revision" && len(setting.Value) >= 12 {
				return setting.Value[:12]
			}
		}
	}
	return "dev"
}

// Registration is how this instance announces itself to the gateway.
type Registration struct {
	// URL is the gateway admin plane, e.g. http://127.0.0.1:1461.
	URL     string
	Token   string
	Service string
	// Address is where the gateway reaches this instance, e.g. 127.0.0.1:1437.
	Address string
	Stage   string
}

// RegistrationFromEnv reads GATEWAY_URL, GATEWAY_REGISTRATION_TOKEN,
// GATEWAY_INSTANCE_ADDRESS and GATEWAY_STAGE; without GATEWAY_URL the service
// does not register.
func RegistrationFromEnv(getenv func(string) string, service string) (*Registration, error) {
	reg := &Registration{URL: strings.TrimRight(getenv("GATEWAY_URL"), "/"), Token: getenv("GATEWAY_REGISTRATION_TOKEN"),
		Service: service, Address: getenv("GATEWAY_INSTANCE_ADDRESS"), Stage: getenv("GATEWAY_STAGE")}
	if reg.URL == "" {
		return nil, nil
	}
	if reg.Token == "" {
		return nil, errors.New("GATEWAY_REGISTRATION_TOKEN is required with GATEWAY_URL")
	}
	if _, _, err := net.SplitHostPort(reg.Address); err != nil {
		return nil, fmt.Errorf("GATEWAY_INSTANCE_ADDRESS must be host:port: %w", err)
	}
	return reg, nil
}

// Interval between heartbeats; the gateway takes an instance offline after three misses.
const Interval = 10 * time.Second

// Start sends heartbeats until the app terminates, then deregisters so the
// gateway stops routing here before the listener closes.
func Start(app core.App, reg Registration, manifest []byte) {
	client := &http.Client{Timeout: 3 * time.Second}
	body, _ := json.Marshal(map[string]any{"service": reg.Service, "address": reg.Address, "stage": reg.Stage,
		"version": Version(), "manifestHash": Hash(manifest)})
	send := func(ctx context.Context, path string) error {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, reg.URL+path, bytes.NewReader(body))
		if err != nil {
			return err
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+reg.Token)
		res, err := client.Do(req)
		if err != nil {
			return err
		}
		res.Body.Close()
		if res.StatusCode != http.StatusOK && res.StatusCode != http.StatusNoContent {
			return fmt.Errorf("gateway answered %d", res.StatusCode)
		}
		return nil
	}

	ctx, cancel := context.WithCancel(context.Background())
	var done sync.WaitGroup
	done.Add(1)
	go func() {
		defer done.Done()
		ticker := time.NewTicker(Interval)
		defer ticker.Stop()
		var failing bool
		for {
			err := send(ctx, "/gateway/v1/heartbeat")
			switch {
			case err != nil && !failing && ctx.Err() == nil:
				app.Logger().Warn("Gateway heartbeat failing", "gateway", reg.URL, "error", err.Error())
			case err == nil && failing:
				app.Logger().Info("Gateway heartbeat recovered", "gateway", reg.URL)
			}
			failing = err != nil
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	}()
	app.OnTerminate().BindFunc(func(e *core.TerminateEvent) error {
		cancel()
		done.Wait()
		deregister, stop := context.WithTimeout(context.Background(), 2*time.Second)
		defer stop()
		if err := send(deregister, "/gateway/v1/deregister"); err != nil {
			app.Logger().Warn("Gateway deregistration failed", "error", err.Error())
		}
		return e.Next()
	})
}
