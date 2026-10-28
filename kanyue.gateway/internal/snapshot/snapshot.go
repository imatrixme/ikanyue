// Package snapshot is what the data plane serves from: a published configuration
// compiled into per-site route tables, and the routable instances per service
// and stage. Both are immutable once built; the control plane swaps whole values.
package snapshot

import (
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
)

// Config is one published configuration version.
type Config struct {
	Version  int       `json:"version"`
	Sites    []Site    `json:"sites"`
	Services []Service `json:"services"`
	Routes   []Route   `json:"routes"`
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
	// HeaderTimeoutMs bounds the wait for upstream response headers; streams are not cut once they start.
	HeaderTimeoutMs int `json:"headerTimeoutMs,omitempty"`
}

type Route struct {
	ID         string      `json:"id"`
	Name       string      `json:"name"`
	Site       string      `json:"site"`
	Service    string      `json:"service"`
	Operations []Operation `json:"operations"`
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

// Target is what a matched request is proxied to.
type Target struct {
	Route     string
	Service   *Service
	Operation Operation
}

// ServeHTTP is never called: the muxes are used for lookup only.
func (*Target) ServeHTTP(http.ResponseWriter, *http.Request) {}

// Routes is a compiled configuration.
type Routes struct {
	Version int
	sites   map[string]*http.ServeMux
}

// Compile validates cfg and builds its route tables; conflicting patterns are errors, never panics.
func Compile(cfg Config) (*Routes, error) {
	services := map[string]*Service{}
	for i := range cfg.Services {
		services[cfg.Services[i].ID] = &cfg.Services[i]
	}
	muxes := map[string]*http.ServeMux{}
	compiled := &Routes{Version: cfg.Version, sites: map[string]*http.ServeMux{}}
	var errs []error
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
		for _, op := range route.Operations {
			if err := handle(mux, op.Pattern(), &Target{Route: route.ID, Service: service, Operation: op}); err != nil {
				errs = append(errs, fmt.Errorf("route %q: %w", route.Name, err))
			}
		}
	}
	if err := errors.Join(errs...); err != nil {
		return nil, err
	}
	return compiled, nil
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

// Instance is one routable upstream address.
type Instance struct {
	Service string `json:"service"`
	Stage   string `json:"stage"`
	Address string `json:"address"`
	// Weight below 1 counts as 1; take an instance out of rotation by draining it instead.
	Weight int `json:"weight"`
}

// Endpoints are the routable instances grouped by service and stage.
type Endpoints struct {
	pools map[string]*pool
}

func NewEndpoints(instances []Instance) (*Endpoints, error) {
	sorted := append([]Instance(nil), instances...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].Address < sorted[j].Address })
	e := &Endpoints{pools: map[string]*pool{}}
	for _, instance := range sorted {
		target, err := url.Parse("http://" + instance.Address)
		if err != nil || target.Host != instance.Address {
			return nil, fmt.Errorf("instance %q: invalid address", instance.Address)
		}
		key := instance.Service + "\x00" + instance.Stage
		p := e.pools[key]
		if p == nil {
			p = &pool{}
			e.pools[key] = p
		}
		p.peers = append(p.peers, peer{target: target, weight: max(instance.Weight, 1)})
	}
	return e, nil
}

// Pick chooses an instance by smooth weighted round robin.
func (e *Endpoints) Pick(service, stage string) (*url.URL, bool) {
	if e == nil {
		return nil, false
	}
	p := e.pools[service+"\x00"+stage]
	if p == nil {
		return nil, false
	}
	return p.next(), true
}

type pool struct {
	mu    sync.Mutex
	peers []peer
}

type peer struct {
	target          *url.URL
	weight, current int
}

func (p *pool) next() *url.URL {
	p.mu.Lock()
	defer p.mu.Unlock()
	total, best := 0, 0
	for i := range p.peers {
		p.peers[i].current += p.peers[i].weight
		total += p.peers[i].weight
		if p.peers[i].current > p.peers[best].current {
			best = i
		}
	}
	p.peers[best].current -= total
	return p.peers[best].target
}
