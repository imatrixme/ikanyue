package snapshot

import (
	"fmt"
	"hash/fnv"
	"math"
	"net/url"
	"sort"
	"sync"
	"sync/atomic"
	"time"
)

// Instance is one routable upstream address.
type Instance struct {
	Service string `json:"service"`
	Stage   string `json:"stage"`
	Address string `json:"address"`
	// Weight below 1 counts as 1; take an instance out of rotation by draining it instead.
	Weight int `json:"weight"`
}

// Peer is an instance with its live state. Health survives endpoint rebuilds,
// so a rediscovered instance keeps its record.
type Peer struct {
	URL     *url.URL
	Address string
	weight  int
	*health
}

type health struct {
	inflight atomic.Int64
	// down is set by active checks; ejectedUntil (unix nanos) by passive failures.
	down         atomic.Bool
	ejectedUntil atomic.Int64
	failures     atomic.Int32
	ejections    atomic.Int32
	// Active check bookkeeping, touched only by the checker.
	nextCheck  time.Time
	passStreak int
	failStreak int
}

// Healthy reports whether the peer may take traffic at now.
func (p *Peer) Healthy(now time.Time) bool {
	return !p.down.Load() && now.UnixNano() >= p.ejectedUntil.Load()
}

// Inflight is the number of exchanges the peer is serving.
func (p *Peer) Inflight() int64 { return p.inflight.Load() }

// Acquire counts an exchange in; the returned func counts it out.
func (p *Peer) Acquire() func() {
	p.inflight.Add(1)
	var once sync.Once
	return func() { once.Do(func() { p.inflight.Add(-1) }) }
}

// Endpoints are the routable instances grouped by service and stage.
type Endpoints struct {
	pools  map[string]*pool
	health map[string]*health // by address
}

type pool struct {
	service string
	mu      sync.Mutex
	peers   []*Peer
	current []int // smooth weighted round robin state, by peer index
}

// NewEndpoints groups instances, keeping the health of addresses prev already knew.
func NewEndpoints(instances []Instance, prev *Endpoints) (*Endpoints, error) {
	sorted := append([]Instance(nil), instances...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].Address < sorted[j].Address })
	e := &Endpoints{pools: map[string]*pool{}, health: map[string]*health{}}
	for _, instance := range sorted {
		target, err := url.Parse("http://" + instance.Address)
		if err != nil || target.Host != instance.Address {
			return nil, fmt.Errorf("instance %q: invalid address", instance.Address)
		}
		h := e.health[instance.Address]
		if h == nil && prev != nil {
			h = prev.health[instance.Address]
		}
		if h == nil {
			h = &health{}
		}
		e.health[instance.Address] = h
		key := poolKey(instance.Service, instance.Stage)
		p := e.pools[key]
		if p == nil {
			p = &pool{service: instance.Service}
			e.pools[key] = p
		}
		p.peers = append(p.peers, &Peer{URL: target, Address: instance.Address, weight: max(instance.Weight, 1), health: h})
		p.current = append(p.current, 0)
	}
	return e, nil
}

func poolKey(service, stage string) string { return service + "\x00" + stage }

// Has reports whether the service has instances for the stage, healthy or not.
func (e *Endpoints) Has(service, stage string) bool {
	return e != nil && e.pools[poolKey(service, stage)] != nil
}

// Pick chooses a healthy peer of the service and stage other than exclude;
// key feeds the hash balancer.
func (e *Endpoints) Pick(service *Service, stage, key string, exclude *Peer, now time.Time) (*Peer, bool) {
	if e == nil {
		return nil, false
	}
	p := e.pools[poolKey(service.ID, stage)]
	if p == nil {
		return nil, false
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	var candidates []int
	for i, peer := range p.peers {
		if peer != exclude && peer.Healthy(now) {
			candidates = append(candidates, i)
		}
	}
	if len(candidates) == 0 {
		return nil, false
	}
	switch {
	case service.Balancer == "hash" && key != "":
		return p.peers[rendezvous(p.peers, candidates, key)], true
	case service.Balancer == "least-inflight":
		best := candidates[0]
		for _, i := range candidates[1:] {
			if p.peers[i].Inflight()*int64(p.peers[best].weight) < p.peers[best].Inflight()*int64(p.peers[i].weight) {
				best = i
			}
		}
		return p.peers[best], true
	}
	return p.peers[p.smooth(candidates)], true
}

// smooth is nginx's smooth weighted round robin over the candidates.
func (p *pool) smooth(candidates []int) int {
	total, best := 0, candidates[0]
	for _, i := range candidates {
		p.current[i] += p.peers[i].weight
		total += p.peers[i].weight
		if p.current[i] > p.current[best] {
			best = i
		}
	}
	p.current[best] -= total
	return best
}

// rendezvous is weighted highest-random-weight hashing: a key stays on its peer
// while that peer is healthy, and only its keys move when it leaves.
func rendezvous(peers []*Peer, candidates []int, key string) int {
	best, bestScore := candidates[0], math.Inf(-1)
	for _, i := range candidates {
		h := fnv.New64a()
		h.Write([]byte(key))
		h.Write([]byte{0})
		h.Write([]byte(peers[i].Address))
		u := (float64(h.Sum64()>>11) + 0.5) / (1 << 53)
		if score := -float64(peers[i].weight) / math.Log(u); score > bestScore {
			best, bestScore = i, score
		}
	}
	return best
}

const (
	ejectBase = 10 * time.Second
	ejectMax  = 5 * time.Minute
)

// Report records an exchange's outcome. threshold failures in a row eject the
// peer for a pause that doubles each time, but never the last healthy peer of
// its pool: a lone instance with hiccups is better than none.
func (e *Endpoints) Report(service *Service, stage string, peer *Peer, failed bool, now time.Time) {
	if !failed {
		peer.failures.Store(0)
		peer.ejections.Store(0)
		return
	}
	threshold := int32(service.PassiveFailures)
	if threshold <= 0 {
		threshold = 3
	}
	if peer.failures.Add(1) < threshold {
		return
	}
	p := e.pools[poolKey(service.ID, stage)]
	if p == nil {
		return
	}
	healthy := 0
	p.mu.Lock()
	for _, other := range p.peers {
		if other != peer && other.Healthy(now) {
			healthy++
		}
	}
	p.mu.Unlock()
	if healthy == 0 {
		return
	}
	pause := ejectBase << min(peer.ejections.Add(1)-1, 5)
	peer.ejectedUntil.Store(now.Add(min(pause, ejectMax)).UnixNano())
	peer.failures.Store(0)
}

// Due lists the peers of service whose active check is due, and schedules their next one.
func (e *Endpoints) Due(service *Service, now time.Time) []*Peer {
	if e == nil || service.Health == nil {
		return nil
	}
	interval := time.Duration(service.Health.IntervalSeconds) * time.Second
	var due []*Peer
	seen := map[*health]bool{}
	for _, p := range e.pools {
		if p.service != service.ID {
			continue
		}
		for _, peer := range p.peers {
			if seen[peer.health] || now.Before(peer.nextCheck) {
				continue
			}
			seen[peer.health] = true
			peer.nextCheck = now.Add(interval)
			due = append(due, peer)
		}
	}
	sort.Slice(due, func(i, j int) bool { return due[i].Address < due[j].Address })
	return due
}

// Checked records an active check result; Threshold results in a row flip the peer.
func (p *Peer) Checked(passed bool, threshold int) (changed bool) {
	threshold = max(threshold, 1)
	if passed {
		p.passStreak, p.failStreak = p.passStreak+1, 0
		if p.down.Load() && p.passStreak >= threshold {
			p.down.Store(false)
			return true
		}
		return false
	}
	p.failStreak, p.passStreak = p.failStreak+1, 0
	if !p.down.Load() && p.failStreak >= threshold {
		p.down.Store(true)
		return true
	}
	return false
}

// Status describes each peer, for the console.
type Status struct {
	Service  string `json:"service"`
	Stage    string `json:"stage"`
	Address  string `json:"address"`
	Healthy  bool   `json:"healthy"`
	Inflight int64  `json:"inflight"`
}

func (e *Endpoints) Status(now time.Time) []Status {
	if e == nil {
		return nil
	}
	var out []Status
	for key, p := range e.pools {
		stage := key[len(p.service)+1:]
		for _, peer := range p.peers {
			out = append(out, Status{Service: p.service, Stage: stage, Address: peer.Address, Healthy: peer.Healthy(now),
				Inflight: peer.Inflight()})
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Service != out[j].Service {
			return out[i].Service < out[j].Service
		}
		return out[i].Address < out[j].Address
	})
	return out
}

// Healthy counts the healthy peers of a service across stages.
func (e *Endpoints) Healthy(service string, now time.Time) (healthy, total int) {
	if e == nil {
		return 0, 0
	}
	for _, p := range e.pools {
		if p.service != service {
			continue
		}
		for _, peer := range p.peers {
			total++
			if peer.Healthy(now) {
				healthy++
			}
		}
	}
	return healthy, total
}
