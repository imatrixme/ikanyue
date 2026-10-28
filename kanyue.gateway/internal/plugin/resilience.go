package plugin

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"hash/fnv"
	"io"
	"math/rand/v2"
	"net/http"
	"regexp"
	"slices"
	"strings"
	"sync"
	"time"
)

func init() {
	register(circuitBreaker)
	register(fallbackPlugin)
	register(trafficSplit)
	register(mirror)
}

// Unavailable is what an open breaker answers when the route has no fallback.
var Unavailable = &Reply{Status: http.StatusServiceUnavailable, Message: "服务暂不可用", Reason: "Circuit breaker open", Degraded: true}

// circuit-breaker opens when a route's error or slow-call ratio crosses its
// threshold within a window, rejects until openSeconds pass, then lets one probe through.
var circuitBreaker = define("circuit-breaker", 500, `{"type":"object","additionalProperties":false,"properties":{
	"windowSeconds":{"type":"integer","minimum":1,"maximum":3600},
	"minRequests":{"type":"integer","minimum":1,"maximum":100000},
	"errorRatio":{"type":"number","minimum":0,"maximum":1},
	"slowMs":{"type":"integer","minimum":0,"maximum":600000},
	"slowRatio":{"type":"number","minimum":0,"maximum":1},
	"openSeconds":{"type":"integer","minimum":1,"maximum":3600}}}`,
	func(c struct {
		WindowSeconds int     `json:"windowSeconds"`
		MinRequests   int     `json:"minRequests"`
		ErrorRatio    float64 `json:"errorRatio"`
		SlowMs        int     `json:"slowMs"`
		SlowRatio     float64 `json:"slowRatio"`
		OpenSeconds   int     `json:"openSeconds"`
	}, scope Scope) (Instance, error) {
		now := time.Now
		if scope.Now != nil {
			now = scope.Now
		}
		errorRatio := c.ErrorRatio
		if errorRatio == 0 {
			errorRatio = 0.5
		}
		return &breaker{window: seconds(c.WindowSeconds, 10), minRequests: orInt(c.MinRequests, 10), errorRatio: errorRatio,
			slow: time.Duration(c.SlowMs) * time.Millisecond, slowRatio: c.SlowRatio, open: seconds(c.OpenSeconds, 30),
			signal: scope.Signal, key: orString(scope.RouteName, scope.Route), now: now}, nil
	})

func seconds(value, fallback int) time.Duration {
	return time.Duration(orInt(value, fallback)) * time.Second
}

type breaker struct {
	window, slow, open      time.Duration
	minRequests             int
	errorRatio, slowRatio   float64
	signal                  func(kind, key string, active bool)
	key                     string
	now                     func() time.Time
	mu                      sync.Mutex
	state                   int // stateClosed, stateOpen or stateProbing
	windowStart, openedAt   time.Time
	total, failures, slowed int
}

const (
	stateClosed = iota
	stateOpen
	stateProbing
)

func (b *breaker) Request(*Context) *Reply {
	b.mu.Lock()
	defer b.mu.Unlock()
	switch b.state {
	case stateOpen:
		if b.now().Sub(b.openedAt) < b.open {
			return Unavailable
		}
		b.state = stateProbing
		return nil
	case stateProbing:
		return Unavailable // one probe at a time
	}
	return nil
}

func (b *breaker) Log(ctx *Context) {
	if ctx.Upstream == "" && ctx.Err == nil {
		return // answered by the gateway; says nothing about the upstream
	}
	failed := ctx.Err != nil || ctx.Status >= 500
	now := b.now()
	b.mu.Lock()
	defer b.mu.Unlock()
	switch b.state {
	case stateProbing:
		if failed {
			b.trip(now)
		} else {
			b.state, b.total, b.failures, b.slowed, b.windowStart = stateClosed, 0, 0, 0, now
			b.notify(false)
		}
		return
	case stateOpen:
		return
	}
	if now.Sub(b.windowStart) >= b.window {
		b.windowStart, b.total, b.failures, b.slowed = now, 0, 0, 0
	}
	b.total++
	if failed {
		b.failures++
	}
	if b.slow > 0 && ctx.Duration >= b.slow {
		b.slowed++
	}
	if b.total < b.minRequests {
		return
	}
	if float64(b.failures)/float64(b.total) >= b.errorRatio ||
		(b.slowRatio > 0 && float64(b.slowed)/float64(b.total) >= b.slowRatio) {
		b.trip(now)
		b.notify(true)
	}
}

func (b *breaker) trip(now time.Time) {
	b.state, b.openedAt = stateOpen, now
}

func (b *breaker) notify(active bool) {
	if b.signal != nil {
		b.signal("breaker", b.key, active)
	}
}

// fallback answers instead of a failed upstream, and instead of an open breaker.
var fallbackPlugin = define("fallback", 0, `{"type":"object","additionalProperties":false,"properties":{
	"status":{"type":"integer","minimum":200,"maximum":599},
	"message":{"type":"string","maxLength":200},
	"contentType":{"type":"string","maxLength":100},
	"body":{"type":"string","maxLength":1048576},
	"onStatuses":{"type":"array","maxItems":20,"items":{"type":"integer","minimum":400,"maximum":599}}}}`,
	func(c struct {
		Status      int    `json:"status"`
		Message     string `json:"message"`
		ContentType string `json:"contentType"`
		Body        string `json:"body"`
		OnStatuses  []int  `json:"onStatuses"`
	}, _ Scope) (Instance, error) {
		reply := &Reply{Status: orInt(c.Status, http.StatusServiceUnavailable), Message: orString(c.Message, "服务繁忙，请稍后再试"),
			Reason: "Fallback"}
		if c.Body != "" {
			reply.Body, reply.ContentType = []byte(c.Body), orString(c.ContentType, "application/json; charset=utf-8")
		}
		statuses := c.OnStatuses
		if len(statuses) == 0 {
			statuses = []int{500, 502, 503, 504}
		}
		return &fallback{fixed: reply, statuses: statuses}, nil
	})

type fallback struct {
	fixed    *Reply
	statuses []int
}

func (f *fallback) Request(*Context) *Reply { return nil }

func (f *fallback) Response(ctx *Context) *Reply {
	if ctx.Err != nil || slices.Contains(f.statuses, ctx.Status) {
		return f.fixed
	}
	return nil
}

func (f *fallback) reply() *Reply { return f.fixed }

var stagePattern = regexp.MustCompile(`^[A-Z][A-Z0-9_]{0,19}$`)

// traffic-split sends matching requests to another stage of the same service:
// by header or cookie value, or a stable percentage hashed by user, IP, header or cookie.
var trafficSplit = define("traffic-split", 400, `{"type":"object","additionalProperties":false,"required":["rules"],"properties":{
	"rules":{"type":"array","maxItems":20,"items":{"type":"object","additionalProperties":false,"required":["stage"],"properties":{
		"stage":{"type":"string","pattern":"^[A-Z][A-Z0-9_]{0,19}$"},
		"header":{"type":"string","maxLength":100},
		"cookie":{"type":"string","maxLength":100},
		"value":{"type":"string","maxLength":200},
		"percent":{"type":"number","minimum":0,"maximum":100},
		"hashBy":{"type":"string","pattern":"^(user|ip|random|header:.+|cookie:.+)$"}}}}}}`,
	func(c struct {
		Rules []splitRule `json:"rules"`
	}, scope Scope) (Instance, error) {
		for i, rule := range c.Rules {
			if !stagePattern.MatchString(rule.Stage) {
				return nil, fmt.Errorf("rules[%d]: invalid stage", i)
			}
			if rule.Value == "" && rule.Percent == 0 {
				return nil, fmt.Errorf("rules[%d]: needs a header or cookie value, or a percent", i)
			}
			if rule.Value != "" && rule.Header == "" && rule.Cookie == "" {
				return nil, fmt.Errorf("rules[%d]: value needs a header or cookie", i)
			}
		}
		return &splitter{rules: c.Rules, route: scope.Route}, nil
	})

type splitRule struct {
	Stage   string  `json:"stage"`
	Header  string  `json:"header"`
	Cookie  string  `json:"cookie"`
	Value   string  `json:"value"`
	Percent float64 `json:"percent"`
	HashBy  string  `json:"hashBy"`
}

type splitter struct {
	rules []splitRule
	route string
}

func (s *splitter) Request(ctx *Context) *Reply {
	for _, rule := range s.rules {
		if rule.Value != "" && !matchesValue(ctx.Request, rule) {
			continue
		}
		if rule.Percent > 0 && bucket(s.route, hashKey(ctx, rule.HashBy)) >= rule.Percent {
			continue
		}
		ctx.Stage = rule.Stage
		return nil
	}
	return nil
}

func matchesValue(r *http.Request, rule splitRule) bool {
	if rule.Header != "" {
		return r.Header.Get(rule.Header) == rule.Value
	}
	cookie, err := r.Cookie(rule.Cookie)
	return err == nil && cookie.Value == rule.Value
}

// hashKey is what keeps one caller on one side of a split; requests without a user fall back to the client IP.
func hashKey(ctx *Context, by string) string {
	switch {
	case by == "random":
		return ""
	case by == "ip":
		return ctx.ClientIP.String()
	case strings.HasPrefix(by, "header:"):
		return ctx.Request.Header.Get(strings.TrimPrefix(by, "header:"))
	case strings.HasPrefix(by, "cookie:"):
		if cookie, err := ctx.Request.Cookie(strings.TrimPrefix(by, "cookie:")); err == nil {
			return cookie.Value
		}
		return ""
	}
	if ctx.User != "" {
		return ctx.User
	}
	return ctx.ClientIP.String()
}

// bucket maps a key to [0, 100); an empty key is random.
func bucket(salt, key string) float64 {
	if key == "" {
		return rand.Float64() * 100
	}
	h := fnv.New32a()
	h.Write([]byte(salt + "\x00" + key))
	return float64(h.Sum32()%10000) / 100
}

// mirror copies requests to another stage or service; the copy's answer is discarded.
var mirror = define("mirror", 300, `{"type":"object","additionalProperties":false,"properties":{
	"service":{"type":"string","maxLength":63},
	"stage":{"type":"string","pattern":"^[A-Z][A-Z0-9_]{0,19}$"},
	"percent":{"type":"number","minimum":0,"maximum":100},
	"maxBodyBytes":{"type":"integer","minimum":0,"maximum":1048576}}}`,
	func(c struct {
		Service      string  `json:"service"`
		Stage        string  `json:"stage"`
		Percent      float64 `json:"percent"`
		MaxBodyBytes int64   `json:"maxBodyBytes"`
	}, scope Scope) (Instance, error) {
		if c.Service == "" && c.Stage == "" {
			return nil, errors.New("needs a service or a stage to mirror to")
		}
		if scope.Mirror == nil {
			return nil, errors.New("mirroring is not available")
		}
		service := scope.Service
		if c.Service != "" {
			id, ok := scope.Services[c.Service]
			if !ok {
				return nil, fmt.Errorf("unknown service %q", c.Service)
			}
			service = id
		}
		percent := c.Percent
		if percent == 0 {
			percent = 100
		}
		maxBody := c.MaxBodyBytes
		if maxBody == 0 {
			maxBody = 64 << 10
		}
		return &mirroring{send: scope.Mirror, service: service, stage: c.Stage, percent: percent, maxBody: maxBody}, nil
	})

type mirroring struct {
	send           func(ctx *Context, service, stage string, r *http.Request)
	service, stage string
	percent        float64
	maxBody        int64
}

func (m *mirroring) Request(ctx *Context) *Reply {
	if m.percent < 100 && rand.Float64()*100 >= m.percent {
		return nil
	}
	r := ctx.Request
	var body []byte
	if r.Body != nil && r.Body != http.NoBody {
		if r.ContentLength < 0 || r.ContentLength > m.maxBody {
			return nil // streaming or large bodies are not copied
		}
		raw, err := io.ReadAll(r.Body)
		r.Body.Close()
		r.Body = io.NopCloser(bytes.NewReader(raw))
		if err != nil {
			return nil
		}
		body = raw
	}
	copied := r.Clone(context.Background())
	copied.Body = io.NopCloser(bytes.NewReader(body))
	if body == nil {
		copied.Body = http.NoBody
	}
	stage := m.stage
	if stage == "" {
		stage = ctx.Stage
	}
	m.send(ctx, m.service, stage, copied)
	return nil
}
