// Package snapshot is what the data plane serves from: per environment, the
// released API groups and APIs compiled into per-domain route tables with their
// plugin chains, and the routable instances per service and stage. Everything is
// immutable once built (instance health aside); the control plane swaps whole
// environments.
package snapshot

import (
	"errors"
	"fmt"
	"maps"
	"net"
	"net/http"
	"slices"
	"sort"
	"strings"
	"time"

	"kanyue.gateway/internal/plugin"
	"kanyue.gateway/internal/policy"
)

// Config is what one environment serves: the released definitions plus the
// services, applications and secrets as they were when it was released.
type Config struct {
	Stage     string     `json:"stage"`
	Version   int        `json:"version"`
	Groups    []Group    `json:"groups"`
	APIs      []API      `json:"apis"`
	Services  []Service  `json:"services"`
	Consumers []Consumer `json:"consumers,omitempty"`
	// Secrets are named secrets, encrypted; they are decrypted only while compiling.
	Secrets map[string]string `json:"secrets,omitempty"`
}

// Group is a released API group setting: the domains its APIs are served on.
type Group struct {
	ID      string   `json:"id"`
	Name    string   `json:"name"`
	Domains []Domain `json:"domains"`
	// DefaultPolicySet is shown for reference; it shapes APIs only when they are released.
	DefaultPolicySet string `json:"defaultPolicySet,omitempty"`
}

// Domain is matched without port, case-insensitively; "*" catches hosts no group claims.
type Domain struct {
	Host string `json:"host"`
	// FixedStage, when set, serves the domain from that environment only, whatever X-Ca-Stage says.
	FixedStage string `json:"fixedStage,omitempty"`
}

// API is a released API: one operation of a service with its resolved policies.
type API struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	Group      string    `json:"group"`
	Service    string    `json:"service"`
	Operation  Operation `json:"operation"`
	Visibility string    `json:"visibility"`
	Auth       string    `json:"auth"`
	// Priority orders matching on a domain, highest first.
	Priority int `json:"priority,omitempty"`
	Timeouts
	PolicySet string `json:"policySet,omitempty"`
	// Policies are the effective policies, with the layer each comes from.
	Policies []policy.Effective `json:"policies"`
	// Consumers are per-application bindings: replacements, additions and switched-off slots.
	Consumers map[string][]plugin.Binding `json:"consumers,omitempty"`
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

// Timeouts bound one exchange; zero inherits (API → service → default).
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

// Over fills t's zero fields from base.
func (t Timeouts) Over(base Timeouts) Timeouts {
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

// Consumer is a caller with an AppKey; Secret is encrypted.
type Consumer struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	AppKey string `json:"appKey"`
	Secret string `json:"secret"`
}

// Target is what a matched request is proxied to.
type Target struct {
	// Route is the API id and RouteName its name.
	Route     string
	RouteName string
	Group     string
	Stage     string
	Service   *Service
	Operation Operation
	Chain     *plugin.Chain
	Timeouts  Timeouts
}

// ServeHTTP is never called: the muxes are used for lookup only.
func (*Target) ServeHTTP(http.ResponseWriter, *http.Request) {}

// level is the APIs of one priority on a domain.
type level struct {
	priority int
	mux      *http.ServeMux
	patterns map[string]string // pattern → API name, to name both sides of a conflict
}

// Routes is one environment's compiled configuration.
type Routes struct {
	Stage    string
	Version  int
	hosts    map[string][]*level // host → levels, highest priority first
	fixed    map[string]bool     // hosts fixed to this environment
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
	if !policy.ValidStage(cfg.Stage) {
		return nil, fmt.Errorf("unknown environment %q", cfg.Stage)
	}
	scopeEnv, err := snapshotEnv(cfg, env, decrypt)
	if err != nil {
		errs = append(errs, err)
	}
	services := map[string]*Service{}
	compiled := &Routes{Stage: cfg.Stage, Version: cfg.Version, hosts: map[string][]*level{}, fixed: map[string]bool{}}
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

	// Each group's levels are shared by its hosts.
	groupLevels := map[string]map[int]*level{}
	groupNames := map[string]string{}
	owner := map[string]string{}
	for _, group := range cfg.Groups {
		groupNames[group.ID] = group.Name
		groupLevels[group.ID] = map[int]*level{}
		for _, domain := range group.Domains {
			host := strings.ToLower(strings.TrimSpace(domain.Host))
			if domain.FixedStage != "" && !policy.ValidStage(domain.FixedStage) {
				errs = append(errs, fmt.Errorf("group %q: domain %q is fixed to unknown environment %q", group.Name, host, domain.FixedStage))
				continue
			}
			if domain.FixedStage != "" && domain.FixedStage != cfg.Stage {
				continue // served by its own environment only
			}
			if other, taken := owner[host]; taken {
				errs = append(errs, fmt.Errorf("domain %q belongs to groups %q and %q", host, other, group.Name))
				continue
			}
			owner[host] = group.Name
			compiled.hosts[host] = nil
			if domain.FixedStage != "" {
				compiled.fixed[host] = true
			}
		}
		if len(group.Domains) == 0 {
			errs = append(errs, fmt.Errorf("group %q has no domains", group.Name))
		}
	}
	for _, api := range cfg.APIs {
		levels, service := groupLevels[api.Group], services[api.Service]
		switch {
		case levels == nil:
			errs = append(errs, fmt.Errorf("API %q: its group is not released in %s", api.Name, cfg.Stage))
			continue
		case service == nil:
			errs = append(errs, fmt.Errorf("API %q: unknown service", api.Name))
			continue
		}
		chain, err := plugin.NewChain(policy.Bindings(api.Policies), api.Consumers,
			plugin.Scope{Env: scopeEnv, Route: api.ID, RouteName: api.Name, Stage: cfg.Stage, Service: service.ID})
		if err != nil {
			errs = append(errs, fmt.Errorf("API %q: %w", api.Name, err))
			continue
		}
		l := levels[api.Priority]
		if l == nil {
			l = &level{priority: api.Priority, mux: http.NewServeMux(), patterns: map[string]string{}}
			levels[api.Priority] = l
		}
		target := &Target{Route: api.ID, RouteName: api.Name, Group: groupNames[api.Group], Stage: cfg.Stage, Service: service,
			Operation: api.Operation, Chain: chain, Timeouts: api.Timeouts.Over(service.Timeouts)}
		if err := l.handle(api.Operation.Pattern(), api.Name, target); err != nil {
			errs = append(errs, fmt.Errorf("API %q: %w", api.Name, err))
		}
	}
	for _, group := range cfg.Groups {
		levels := slices.SortedFunc(maps.Values(groupLevels[group.ID]), func(a, b *level) int { return b.priority - a.priority })
		for _, domain := range group.Domains {
			host := strings.ToLower(strings.TrimSpace(domain.Host))
			if _, ok := compiled.hosts[host]; ok && owner[host] == group.Name {
				compiled.hosts[host] = levels
			}
		}
	}
	if err := errors.Join(errs...); err != nil {
		return nil, err
	}
	return compiled, nil
}

// snapshotEnv is env with this environment's consumers, services and secrets.
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

// handle registers target, turning ServeMux's registration panics (conflicts,
// bad patterns) into errors that name the other API.
func (l *level) handle(pattern, name string, target *Target) (err error) {
	defer func() {
		if recovered := recover(); recovered == nil {
			l.patterns[pattern] = name
		} else if other := l.conflict(pattern); other != "" {
			err = fmt.Errorf("pattern %q conflicts with API %q at priority %d", pattern, other, l.priority)
		} else {
			err = fmt.Errorf("%v", recovered)
		}
	}()
	l.mux.Handle(pattern, target)
	return nil
}

// conflict finds the registered API whose pattern conflicts with pattern.
func (l *level) conflict(pattern string) string {
	for _, registered := range slices.Sorted(maps.Keys(l.patterns)) {
		if conflicts(registered, pattern) {
			return l.patterns[registered]
		}
	}
	return ""
}

func conflicts(a, b string) (yes bool) {
	defer func() { yes = recover() != nil }()
	mux := http.NewServeMux()
	mux.Handle(a, http.NotFoundHandler())
	mux.Handle(b, http.NotFoundHandler())
	return false
}

// Match finds the target of r; ok is false when no API matches.
func (r *Routes) Match(req *http.Request) (*Target, bool) {
	if r == nil {
		return nil, false
	}
	levels, ok := r.hosts[hostname(req.Host)]
	if !ok {
		levels = r.hosts["*"]
	}
	for _, l := range levels {
		handler, _ := l.mux.Handler(req)
		if target, ok := handler.(*Target); ok {
			return target, true
		}
	}
	return nil, false
}

func hostname(host string) string {
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	return strings.ToLower(strings.TrimSuffix(host, "."))
}

// Table is every environment's routes: what the data plane holds.
type Table struct {
	stages map[string]*Routes
	fixed  map[string]string // host → the environment it is fixed to
}

// With is a copy of t serving routes for its environment; a domain fixed to
// two environments is an error.
func (t *Table) With(routes *Routes) (*Table, error) {
	next := &Table{stages: map[string]*Routes{}, fixed: map[string]string{}}
	if t != nil {
		maps.Copy(next.stages, t.stages)
	}
	next.stages[routes.Stage] = routes
	var errs []error
	for _, stage := range policy.Stages {
		for _, host := range slices.Sorted(maps.Keys(next.stages[stage].fixedHosts())) {
			if other, taken := next.fixed[host]; taken {
				errs = append(errs, fmt.Errorf("domain %q is fixed to both %s and %s", host, other, stage))
				continue
			}
			next.fixed[host] = stage
		}
	}
	return next, errors.Join(errs...)
}

func (r *Routes) fixedHosts() map[string]bool {
	if r == nil {
		return nil
	}
	return r.fixed
}

// Stage resolves a request's environment: the domain's fixed one, else
// X-Ca-Stage, else RELEASE. ok is false for an unknown X-Ca-Stage.
func (t *Table) Stage(host, header string) (string, bool) {
	if t != nil {
		name := hostname(host)
		if stage, fixed := t.fixed[name]; fixed {
			return stage, true
		}
		if stage, fixed := t.fixed["*"]; fixed && !t.claimed(name) {
			return stage, true
		}
	}
	stage := strings.ToUpper(strings.TrimSpace(header))
	if stage == "" {
		return policy.DefaultStage, true
	}
	return stage, policy.ValidStage(stage)
}

// claimed reports whether some environment serves host by name.
func (t *Table) claimed(host string) bool {
	for _, routes := range t.stages {
		if _, ok := routes.hosts[host]; ok {
			return true
		}
	}
	return false
}

// Routes is one environment's routes; nil before its first release.
func (t *Table) Routes(stage string) *Routes {
	if t == nil {
		return nil
	}
	return t.stages[stage]
}

// Versions is each environment's served version; 0 before its first release.
func (t *Table) Versions() map[string]int {
	out := map[string]int{}
	for _, stage := range policy.Stages {
		out[stage] = 0
		if routes := t.Routes(stage); routes != nil {
			out[stage] = routes.Version
		}
	}
	return out
}

// Services lists every environment's services once, for health checks and
// mirroring; RELEASE's settings win, then PRE's.
func (t *Table) Services() []*Service {
	seen := map[string]bool{}
	var out []*Service
	for _, stage := range []string{"RELEASE", "PRE", "TEST"} {
		for _, service := range t.Routes(stage).Services() {
			if !seen[service.ID] {
				seen[service.ID] = true
				out = append(out, service)
			}
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

// RoutedServices lists the ids of services the APIs point at.
func (cfg Config) RoutedServices() []string {
	seen := map[string]bool{}
	var ids []string
	for _, api := range cfg.APIs {
		if !seen[api.Service] {
			seen[api.Service] = true
			ids = append(ids, api.Service)
		}
	}
	sort.Strings(ids)
	return ids
}
