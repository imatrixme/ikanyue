// Package snapshot is what the data plane serves from: a published configuration
// compiled into per-site route tables with their plugin chains, and the routable
// instances per service and stage. Both are immutable once built (instance health
// aside); the control plane swaps whole values.
package snapshot

import (
	"errors"
	"fmt"
	"net"
	"net/http"
	"sort"
	"strings"
	"time"

	"kanyue.gateway/internal/plugin"
)

// Config is one published configuration version.
type Config struct {
	Version   int        `json:"version"`
	Sites     []Site     `json:"sites"`
	Services  []Service  `json:"services"`
	Routes    []Route    `json:"routes"`
	Bindings  []Binding  `json:"bindings,omitempty"`
	Consumers []Consumer `json:"consumers,omitempty"`
	// Secrets are named secrets, encrypted; they are decrypted only while compiling.
	Secrets map[string]string `json:"secrets,omitempty"`
}

type Site struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	// Hosts are matched without port, case-insensitively; "*" catches unmatched hosts.
	Hosts []string `json:"hosts"`
}

type Service struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Timeouts
	// Balancer is round-robin (default), least-inflight or hash.
	Balancer string `json:"balancer,omitempty"`
	// HashBy keys the hash balancer: user, ip, header:<name> or cookie:<name>.
	HashBy string       `json:"hashBy,omitempty"`
	Health *HealthCheck `json:"health,omitempty"`
	// PassiveFailures in a row take an instance out for a growing pause; 0 means 3.
	PassiveFailures int `json:"passiveFailures,omitempty"`
}

// Timeouts bound one exchange; zero inherits (route → service → default).
type Timeouts struct {
	// HeaderTimeoutMs bounds the wait for upstream response headers; streams are not cut once they start.
	HeaderTimeoutMs int `json:"headerTimeoutMs,omitempty"`
	// TimeoutMs bounds the whole exchange, streams included.
	TimeoutMs int `json:"timeoutMs,omitempty"`
	// IdleTimeoutMs bounds the silence between response body reads.
	IdleTimeoutMs int `json:"idleTimeoutMs,omitempty"`
}

func (t Timeouts) Header() time.Duration { return time.Duration(t.HeaderTimeoutMs) * time.Millisecond }
func (t Timeouts) Total() time.Duration  { return time.Duration(t.TimeoutMs) * time.Millisecond }
func (t Timeouts) Idle() time.Duration   { return time.Duration(t.IdleTimeoutMs) * time.Millisecond }

func (t Timeouts) over(base Timeouts) Timeouts {
	if t.HeaderTimeoutMs == 0 {
		t.HeaderTimeoutMs = base.HeaderTimeoutMs
	}
	if t.TimeoutMs == 0 {
		t.TimeoutMs = base.TimeoutMs
	}
	if t.IdleTimeoutMs == 0 {
		t.IdleTimeoutMs = base.IdleTimeoutMs
	}
	return t
}

// HealthCheck is an active probe: Threshold results in a row flip an instance.
type HealthCheck struct {
	Path            string `json:"path"`
	IntervalSeconds int    `json:"intervalSeconds"`
	Threshold       int    `json:"threshold"`
}

type Route struct {
	ID         string      `json:"id"`
	Name       string      `json:"name"`
	Site       string      `json:"site"`
	Service    string      `json:"service"`
	Operations []Operation `json:"operations"`
	Timeouts
}

// Operation is one discovered upstream route.
type Operation struct {
	ID string `json:"id"`
	// Method is empty for routes that accept any method.
	Method string `json:"method"`
	// Path is the upstream's own net/http ServeMux pattern, so matching here agrees with matching there.
	Path       string `json:"path"`
	Module     string `json:"module,omitempty"`
	Auth       string `json:"auth,omitempty"`
	Idempotent bool   `json:"idempotent,omitempty"`
}

// Pattern is the ServeMux pattern of the operation.
func (o Operation) Pattern() string {
	if o.Method == "" {
		return o.Path
	}
	return o.Method + " " + o.Path
}

// Binding attaches a plugin globally or to one site, route or consumer.
type Binding struct {
	plugin.Binding
	// Scope is global, site, route or consumer; Target is the site, route or consumer id.
	Scope  string `json:"scope"`
	Target string `json:"target,omitempty"`
}

// Consumer is a caller with an AppKey; Secret is encrypted.
type Consumer struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	AppKey string `json:"appKey"`
	Secret string `json:"secret"`
}

// Target is what a matched request is proxied to.
type Target struct {
	Route     string
	RouteName string
	Service   *Service
	Operation Operation
	Chain     *plugin.Chain
	Timeouts  Timeouts
}

// ServeHTTP is never called: the muxes are used for lookup only.
func (*Target) ServeHTTP(http.ResponseWriter, *http.Request) {}

// Routes is a compiled configuration.
type Routes struct {
	Version  int
	sites    map[string]*http.ServeMux
	services []*Service
}

// Services lists the configured services, for health checks.
func (r *Routes) Services() []*Service {
	if r == nil {
		return nil
	}
	return r.services
}

// Decrypt turns a stored secret back into plaintext.
type Decrypt func(ciphertext string) (string, error)

// Compile validates cfg and builds its route tables and plugin chains; conflicting
// patterns and invalid plugin configurations are errors, never panics.
func Compile(cfg Config, env *plugin.Env, decrypt Decrypt) (*Routes, error) {
	var errs []error
	scopeEnv, err := snapshotEnv(cfg, env, decrypt)
	if err != nil {
		errs = append(errs, err)
	}
	services := map[string]*Service{}
	compiled := &Routes{Version: cfg.Version, sites: map[string]*http.ServeMux{}}
	for i := range cfg.Services {
		service := &cfg.Services[i]
		services[service.ID] = service
		compiled.services = append(compiled.services, service)
		switch service.Balancer {
		case "", "round-robin", "least-inflight", "hash":
		default:
			errs = append(errs, fmt.Errorf("service %q: unknown balancer %q", service.Name, service.Balancer))
		}
		if health := service.Health; health != nil && (!strings.HasPrefix(health.Path, "/") || health.IntervalSeconds < 1) {
			errs = append(errs, fmt.Errorf("service %q: health check needs a path and an interval", service.Name))
		}
	}
	bindings := map[string]map[string][]plugin.Binding{} // scope → target → bindings
	for _, binding := range cfg.Bindings {
		switch binding.Scope {
		case "global", "site", "route", "consumer":
		default:
			errs = append(errs, fmt.Errorf("binding of %s: unknown scope %q", binding.Plugin, binding.Scope))
			continue
		}
		if bindings[binding.Scope] == nil {
			bindings[binding.Scope] = map[string][]plugin.Binding{}
		}
		bindings[binding.Scope][binding.Target] = append(bindings[binding.Scope][binding.Target], binding.Binding)
	}
	consumerBindings := map[string][]plugin.Binding{}
	for _, consumer := range cfg.Consumers {
		if list := bindings["consumer"][consumer.ID]; len(list) > 0 {
			consumerBindings[consumer.Name] = list
		}
	}

	muxes := map[string]*http.ServeMux{}
	for _, site := range cfg.Sites {
		if len(site.Hosts) == 0 {
			errs = append(errs, fmt.Errorf("site %q has no hosts", site.Name))
		}
		mux := http.NewServeMux()
		muxes[site.ID] = mux
		for _, host := range site.Hosts {
			host = strings.ToLower(strings.TrimSpace(host))
			if _, taken := compiled.sites[host]; taken {
				errs = append(errs, fmt.Errorf("host %q belongs to more than one site", host))
				continue
			}
			compiled.sites[host] = mux
		}
	}
	for _, route := range cfg.Routes {
		mux, service := muxes[route.Site], services[route.Service]
		switch {
		case mux == nil:
			errs = append(errs, fmt.Errorf("route %q: unknown site", route.Name))
			continue
		case service == nil:
			errs = append(errs, fmt.Errorf("route %q: unknown service", route.Name))
			continue
		case len(route.Operations) == 0:
			errs = append(errs, fmt.Errorf("route %q has no operations", route.Name))
			continue
		}
		merged := plugin.Merge(bindings["global"][""], bindings["site"][route.Site], bindings["route"][route.ID])
		chain, err := plugin.NewChain(merged, consumerBindings,
			plugin.Scope{Env: scopeEnv, Route: route.ID, RouteName: route.Name, Service: service.ID})
		if err != nil {
			errs = append(errs, fmt.Errorf("route %q: %w", route.Name, err))
			continue
		}
		timeouts := route.Timeouts.over(service.Timeouts)
		for _, op := range route.Operations {
			target := &Target{Route: route.ID, RouteName: route.Name, Service: service, Operation: op, Chain: chain, Timeouts: timeouts}
			if err := handle(mux, op.Pattern(), target); err != nil {
				errs = append(errs, fmt.Errorf("route %q: %w", route.Name, err))
			}
		}
	}
	if err := errors.Join(errs...); err != nil {
		return nil, err
	}
	return compiled, nil
}

// snapshotEnv is env with this version's consumers, services and secrets.
func snapshotEnv(cfg Config, env *plugin.Env, decrypt Decrypt) (*plugin.Env, error) {
	scoped := &plugin.Env{}
	if env != nil {
		*scoped = *env
	}
	scoped.Services = map[string]string{}
	for _, service := range cfg.Services {
		scoped.Services[service.Name] = service.ID
	}
	open := func(ciphertext string) (string, error) {
		if decrypt == nil {
			return "", errors.New("no encryption key; start with --encryptionEnv")
		}
		return decrypt(ciphertext)
	}
	scoped.Secret = func(name string) (string, error) {
		ciphertext, ok := cfg.Secrets[name]
		if !ok {
			return "", fmt.Errorf("unknown secret %q", name)
		}
		plain, err := open(ciphertext)
		if err != nil {
			return "", fmt.Errorf("secret %q: %w", name, err)
		}
		return plain, nil
	}
	scoped.Consumers = map[string]plugin.Consumer{}
	var errs []error
	names := map[string]bool{}
	for _, consumer := range cfg.Consumers {
		if names[consumer.Name] {
			errs = append(errs, fmt.Errorf("consumer %q appears twice", consumer.Name))
		}
		names[consumer.Name] = true
		if _, taken := scoped.Consumers[consumer.AppKey]; taken {
			errs = append(errs, fmt.Errorf("consumer %q: AppKey already in use", consumer.Name))
			continue
		}
		secret, err := open(consumer.Secret)
		if err != nil {
			errs = append(errs, fmt.Errorf("consumer %q: %w", consumer.Name, err))
			continue
		}
		scoped.Consumers[consumer.AppKey] = plugin.Consumer{ID: consumer.ID, Name: consumer.Name, AppKey: consumer.AppKey, Secret: secret}
	}
	return scoped, errors.Join(errs...)
}

// handle turns ServeMux's registration panics (conflicts, bad patterns) into errors.
func handle(mux *http.ServeMux, pattern string, target *Target) (err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			err = fmt.Errorf("%v", recovered)
		}
	}()
	mux.Handle(pattern, target)
	return nil
}

// Match finds the target of r; ok is false when no route matches.
func (r *Routes) Match(req *http.Request) (*Target, bool) {
	if r == nil {
		return nil, false
	}
	mux := r.sites[hostname(req.Host)]
	if mux == nil {
		mux = r.sites["*"]
	}
	if mux == nil {
		return nil, false
	}
	handler, _ := mux.Handler(req)
	target, ok := handler.(*Target)
	return target, ok
}

func hostname(host string) string {
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	return strings.ToLower(strings.TrimSuffix(host, "."))
}

// RoutedServices lists the ids of services that enabled routes point at.
func (cfg Config) RoutedServices() []string {
	seen := map[string]bool{}
	var ids []string
	for _, route := range cfg.Routes {
		if !seen[route.Service] {
			seen[route.Service] = true
			ids = append(ids, route.Service)
		}
	}
	sort.Strings(ids)
	return ids
}
