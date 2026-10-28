package plugin

import (
	"net/http"
	"sync"
	"time"
)

func init() {
	register(rateLimit)
}

// Limiter counts requests per key and window. The in-memory one serves a
// single node; a shared store can replace it for a cluster.
type Limiter interface {
	Allow(key string, limit int, window time.Duration, now time.Time) bool
}

var windows = map[string]time.Duration{"second": time.Second, "minute": time.Minute, "hour": time.Hour, "day": 24 * time.Hour}

// windowOffset aligns windows on China Standard Time, so a daily quota resets at local midnight.
const windowOffset = 8 * time.Hour

var limitReasons = map[string]string{"api": "Throttled by API Flow Control", "consumer": "Throttled by APP Flow Control",
	"user": "Throttled by USER Flow Control", "ip": "Throttled by IP Flow Control"}

// rate-limit allows limit requests per window, counted per route and the
// chosen key; requests without that key (no consumer, no user) are not counted.
var rateLimit = define("rate-limit", 600, `{"type":"object","additionalProperties":false,"required":["limit","window"],"properties":{
	"limit":{"type":"integer","minimum":1,"maximum":100000000},
	"window":{"type":"string","enum":["second","minute","hour","day"]},
	"by":{"type":"string","enum":["api","consumer","user","ip"]}}}`,
	func(c struct {
		Limit  int    `json:"limit"`
		Window string `json:"window"`
		By     string `json:"by"`
	}, scope Scope) (Instance, error) {
		now := time.Now
		if scope.Now != nil {
			now = scope.Now
		}
		by := orString(c.By, "api")
		return &limit{limiter: scope.Limiter, route: scope.Route, limit: c.Limit, window: windows[c.Window], by: by,
			reply: Fail(http.StatusTooManyRequests, "请求过于频繁，请稍后再试", limitReasons[by]), now: now}, nil
	})

type limit struct {
	limiter Limiter
	route   string
	limit   int
	window  time.Duration
	by      string
	reply   *Reply
	now     func() time.Time
}

func (l *limit) Request(ctx *Context) *Reply {
	var key string
	switch l.by {
	case "api":
		key = ctx.Operation
	case "consumer":
		key = ctx.Consumer
	case "user":
		key = ctx.User
	case "ip":
		key = ctx.ClientIP.String()
	}
	if key == "" && l.by != "api" {
		return nil
	}
	if l.limiter.Allow(l.route+"\x00"+l.by+"\x00"+key, l.limit, l.window, l.now()) {
		return nil
	}
	return l.reply
}

// MemoryLimiter is a fixed-window counter.
type MemoryLimiter struct {
	mu        sync.Mutex
	counts    map[string]*counter
	lastSweep time.Time
}

type counter struct {
	start time.Time
	end   time.Time
	count int
}

func NewMemoryLimiter() *MemoryLimiter { return &MemoryLimiter{counts: map[string]*counter{}} }

func (m *MemoryLimiter) Allow(key string, limit int, window time.Duration, now time.Time) bool {
	start := now.Add(windowOffset).Truncate(window).Add(-windowOffset)
	key += "\x00" + window.String()
	m.mu.Lock()
	defer m.mu.Unlock()
	if now.Sub(m.lastSweep) > time.Minute {
		for k, c := range m.counts {
			if !now.Before(c.end) {
				delete(m.counts, k)
			}
		}
		m.lastSweep = now
	}
	c := m.counts[key]
	if c == nil || !c.start.Equal(start) {
		c = &counter{start: start, end: start.Add(window)}
		m.counts[key] = c
	}
	if c.count >= limit {
		return false
	}
	c.count++
	return true
}
