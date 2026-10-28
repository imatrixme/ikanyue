// Package plugin is the gateway's policy model: plugins declare a JSON Schema,
// are built once at publish time, and run on the data plane as a precompiled
// chain per route. Bindings merge global → site → route; consumer bindings
// override a plugin for that consumer's requests.
package plugin

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/netip"
	"sort"
	"time"
)

// Plugin is one kind of policy.
type Plugin interface {
	Name() string
	// Priority orders the chain, highest first; a binding may override it.
	Priority() int
	// Schema is the JSON Schema of the configuration; the console renders forms from it.
	Schema() json.RawMessage
	// Build validates a configuration and compiles it; an error fails the publish.
	Build(config json.RawMessage, scope Scope) (Instance, error)
}

// Instance is a built plugin. Request runs before the upstream is called and
// may answer the request itself; a nil reply continues the chain.
type Instance interface {
	Request(*Context) *Reply
}

// Responder runs once the upstream answered or failed; a reply replaces the response.
type Responder interface {
	Response(*Context) *Reply
}

// Logger observes the finished exchange; it must not block.
type Logger interface {
	Log(*Context)
}

// Context is one request passing through a route's chain.
type Context struct {
	Request    *http.Request
	ClientIP   netip.Addr
	RequestID  string
	Route      string
	Operation  string
	Idempotent bool
	// Stage picks the instances; traffic-split may change it.
	Stage    string
	Consumer string
	User     string
	// Signed is set once an AppKey signature was verified.
	Signed bool
	// Upstream is the instance the request was sent to; empty when the gateway answered itself.
	Upstream string
	// Proto and Host are what the client used, for forwarding headers.
	Proto, Host string
	// Header is added to whatever response the client finally receives.
	Header http.Header

	// Response phase.
	Status         int
	ResponseHeader http.Header
	Err            error
	Duration       time.Duration
}

// Consumer is a caller registered with an AppKey.
type Consumer struct {
	ID     string
	Name   string
	AppKey string
	Secret string
}

// Env is what plugins may use besides their configuration. It is shared by
// every snapshot, so counters survive a publish.
type Env struct {
	// Secret resolves a named secret to its plaintext.
	Secret func(name string) (string, error)
	// Consumers by AppKey.
	Consumers map[string]Consumer
	Limiter   Limiter
	Nonces    *Nonces
	// Services maps service names to ids.
	Services map[string]string
	// Mirror sends a copy of a request to a service and stage and discards the answer.
	Mirror func(ctx *Context, service, stage string, r *http.Request)
	// Signal reports a condition alerts watch, such as an open breaker.
	Signal func(kind, key string, active bool)
	Now    func() time.Time
}

// Scope is what a plugin instance is built for.
type Scope struct {
	*Env
	Route     string
	RouteName string
	// Service is the id of the route's service.
	Service string
}

var registry = map[string]Plugin{}

func register(p Plugin) {
	if _, taken := registry[p.Name()]; taken {
		panic("plugin registered twice: " + p.Name())
	}
	registry[p.Name()] = p
}

// Lookup returns a built-in plugin by name.
func Lookup(name string) (Plugin, bool) {
	p, ok := registry[name]
	return p, ok
}

// All lists the plugins by name, for the console.
func All() []Plugin {
	all := make([]Plugin, 0, len(registry))
	for _, p := range registry {
		all = append(all, p)
	}
	sort.Slice(all, func(i, j int) bool { return all[i].Name() < all[j].Name() })
	return all
}

// Binding is one plugin attached at some level.
type Binding struct {
	Plugin   string          `json:"plugin"`
	Config   json.RawMessage `json:"config,omitempty"`
	Priority int             `json:"priority,omitempty"`
	// Disabled at a lower level removes a plugin inherited from a higher one.
	Disabled bool `json:"disabled,omitempty"`
}

// Merge applies bindings level by level, later levels overriding earlier ones by plugin name.
func Merge(levels ...[]Binding) []Binding {
	merged := map[string]Binding{}
	var order []string
	for _, level := range levels {
		for _, binding := range level {
			if _, seen := merged[binding.Plugin]; !seen {
				order = append(order, binding.Plugin)
			}
			merged[binding.Plugin] = binding
		}
	}
	out := make([]Binding, 0, len(order))
	for _, name := range order {
		if binding := merged[name]; !binding.Disabled {
			out = append(out, binding)
		}
	}
	return out
}

// Chain is a route's compiled plugins.
type Chain struct {
	slots    []slot
	fallback *fallback
}

type slot struct {
	name      string
	priority  int
	base      Instance
	consumers map[string]Instance
}

func (s *slot) instance(ctx *Context) Instance {
	if ctx.Consumer != "" {
		if instance, ok := s.consumers[ctx.Consumer]; ok {
			return instance
		}
	}
	return s.base
}

// NewChain builds a route's chain from its merged bindings and the per-consumer
// overrides (consumer name → bindings).
func NewChain(bindings []Binding, consumers map[string][]Binding, scope Scope) (*Chain, error) {
	chain := &Chain{}
	slots := map[string]*slot{}
	var errs []error
	get := func(binding Binding) (*slot, Instance, bool) {
		p, ok := Lookup(binding.Plugin)
		if !ok {
			errs = append(errs, fmt.Errorf("unknown plugin %q", binding.Plugin))
			return nil, nil, false
		}
		instance, err := p.Build(binding.Config, scope)
		if err != nil {
			errs = append(errs, fmt.Errorf("plugin %s: %w", binding.Plugin, err))
			return nil, nil, false
		}
		s := slots[binding.Plugin]
		if s == nil {
			s = &slot{name: binding.Plugin, priority: p.Priority(), consumers: map[string]Instance{}}
			slots[binding.Plugin] = s
		}
		if binding.Priority != 0 {
			s.priority = binding.Priority
		}
		return s, instance, true
	}
	for _, binding := range bindings {
		if s, instance, ok := get(binding); ok {
			s.base = instance
			if f, isFallback := instance.(*fallback); isFallback {
				chain.fallback = f
			}
		}
	}
	names := make([]string, 0, len(consumers))
	for name := range consumers {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		for _, binding := range consumers[name] {
			if binding.Disabled {
				continue
			}
			if s, instance, ok := get(binding); ok {
				s.consumers[name] = instance
			}
		}
	}
	if err := errors.Join(errs...); err != nil {
		return nil, err
	}
	for _, s := range slots {
		chain.slots = append(chain.slots, *s)
	}
	sort.SliceStable(chain.slots, func(i, j int) bool {
		if chain.slots[i].priority != chain.slots[j].priority {
			return chain.slots[i].priority > chain.slots[j].priority
		}
		return chain.slots[i].name < chain.slots[j].name
	})
	return chain, nil
}

// Names lists the chain's plugins in execution order.
func (c *Chain) Names() []string {
	if c == nil {
		return nil
	}
	names := make([]string, len(c.slots))
	for i, s := range c.slots {
		names[i] = s.name
	}
	return names
}

// Request runs the request phase; a reply ends the exchange. A degraded reply
// (an open breaker) is replaced by the route's fallback when it has one.
func (c *Chain) Request(ctx *Context) *Reply {
	if c == nil {
		return nil
	}
	for i := range c.slots {
		instance := c.slots[i].instance(ctx)
		if instance == nil {
			continue
		}
		if reply := instance.Request(ctx); reply != nil {
			if reply.Degraded && c.fallback != nil {
				return c.fallback.reply()
			}
			return reply
		}
	}
	return nil
}

// Response runs the response phase; the first reply replaces the upstream's answer.
func (c *Chain) Response(ctx *Context) *Reply {
	if c == nil {
		return nil
	}
	for i := range c.slots {
		if responder, ok := c.slots[i].instance(ctx).(Responder); ok {
			if reply := responder.Response(ctx); reply != nil {
				return reply
			}
		}
	}
	return nil
}

// Log runs the log phase.
func (c *Chain) Log(ctx *Context) {
	if c == nil {
		return
	}
	for i := range c.slots {
		if logger, ok := c.slots[i].instance(ctx).(Logger); ok {
			logger.Log(ctx)
		}
	}
}

// Reply is an answer the gateway gives itself.
type Reply struct {
	Status int
	// Message and ErrorCode fill the business envelope when Body is nil.
	Message   string
	ErrorCode string
	// Reason is sent as X-Ca-Error-Message, like Aliyun's gateway.
	Reason      string
	Header      http.Header
	Body        []byte
	ContentType string
	// Degraded marks a reply a fallback may replace.
	Degraded bool
}

// Write sends the reply.
func (r *Reply) Write(w http.ResponseWriter) {
	body := r.Render(w.Header())
	w.WriteHeader(r.Status)
	_, _ = w.Write(body)
}

// Render sets the reply's headers and returns its body, in kanyue.server's
// envelope unless it carries its own.
func (r *Reply) Render(header http.Header) []byte {
	for key, values := range r.Header {
		header[key] = values
	}
	body := r.Body
	if body == nil {
		envelope := map[string]any{"code": r.Status, "message": r.Message, "data": nil}
		if r.ErrorCode != "" {
			envelope["errorCode"] = r.ErrorCode
		}
		body, _ = json.Marshal(envelope)
		header.Set("Content-Type", "application/json; charset=utf-8")
	} else if r.ContentType != "" {
		header.Set("Content-Type", r.ContentType)
	}
	if r.Reason != "" {
		header.Set("X-Ca-Error-Message", r.Reason)
	}
	header.Del("Content-Length")
	return body
}

// Fail is an error reply in the envelope.
func Fail(status int, message, reason string) *Reply {
	return &Reply{Status: status, Message: message, Reason: reason}
}

// define builds a Plugin whose configuration is validated against its schema
// and then decoded strictly into C.
func define[C any](name string, priority int, schema string, build func(C, Scope) (Instance, error)) Plugin {
	var parsed map[string]any
	if err := json.Unmarshal([]byte(schema), &parsed); err != nil {
		panic(fmt.Sprintf("plugin %s: invalid schema: %v", name, err))
	}
	return &defined[C]{name: name, priority: priority, schema: json.RawMessage(schema), parsed: parsed, build: build}
}

type defined[C any] struct {
	name     string
	priority int
	schema   json.RawMessage
	parsed   map[string]any
	build    func(C, Scope) (Instance, error)
}

func (d *defined[C]) Name() string            { return d.name }
func (d *defined[C]) Priority() int           { return d.priority }
func (d *defined[C]) Schema() json.RawMessage { return d.schema }

func (d *defined[C]) Build(raw json.RawMessage, scope Scope) (Instance, error) {
	if len(raw) == 0 || string(raw) == "null" {
		raw = json.RawMessage("{}")
	}
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, fmt.Errorf("config is not JSON: %w", err)
	}
	if err := Validate(d.parsed, value); err != nil {
		return nil, err
	}
	var config C
	if err := strictDecode(raw, &config); err != nil {
		return nil, err
	}
	return d.build(config, scope)
}
