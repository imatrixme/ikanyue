package coursecredit

import (
	"errors"
	"math"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/jsx"
)

// Hono's metricsService: in-process command counters plus durable gauges read
// from the ledger. Counters live per process, like Hono's module singleton.

var (
	conflictCodes     = map[string]bool{"IDEMPOTENCY_CONFLICT": true, "VERSION_CONFLICT": true}
	insufficientCodes = map[string]bool{"CREDIT_INSUFFICIENT": true, "SESSION_STUDENT_CREDIT_UNRESOLVED": true}
)

const outboxBacklogFilter = `status="pending" || status="failed" || status="processing"`

type commandCounter struct {
	Success         int     `json:"success"`
	Failure         int     `json:"failure"`
	DurationMsTotal float64 `json:"durationMsTotal"`
}

// Metrics is CourseCreditMetrics.
type Metrics struct {
	mu                      sync.Mutex
	clock                   func() time.Time
	commands                map[string]*commandCounter
	conflictTotal           int
	insufficientCreditTotal int
	settlementFailureTotal  int
}

func NewMetrics(clock func() time.Time) *Metrics {
	if clock == nil {
		clock = time.Now
	}
	return &Metrics{clock: clock, commands: map[string]*commandCounter{}}
}

// defaultMetrics is defaultCourseCreditMetrics: every Command reports here.
var defaultMetrics = NewMetrics(nil)

func (m *Metrics) measure(name string, command func() (map[string]any, error)) (map[string]any, error) {
	name = normalizeCommandName(name)
	startedAt := m.clock()
	result, err := command()
	duration := float64(m.clock().Sub(startedAt)) / float64(time.Millisecond)
	m.mu.Lock()
	defer m.mu.Unlock()
	if err == nil {
		m.record(name, true, duration)
		return result, nil
	}
	m.record(name, false, duration)
	code := errorCode(err)
	if conflictCodes[code] {
		m.conflictTotal++
	}
	if insufficientCodes[code] {
		m.insufficientCreditTotal++
	}
	if name == "settleSession" || name == "reverseSessionSettlement" {
		m.settlementFailureTotal++
	}
	return nil, err
}

func (m *Metrics) record(name string, success bool, durationMs float64) {
	current := m.commands[name]
	if current == nil {
		current = &commandCounter{}
		m.commands[name] = current
	}
	if success {
		current.Success++
	} else {
		current.Failure++
	}
	current.DurationMsTotal += math.Max(0, durationMs)
}

func (m *Metrics) snapshot() map[string]any {
	m.mu.Lock()
	defer m.mu.Unlock()
	names := make([]string, 0, len(m.commands))
	for name := range m.commands {
		names = append(names, name)
	}
	sort.Strings(names)
	commands := map[string]any{}
	success, failure := 0, 0
	for _, name := range names {
		counter := *m.commands[name]
		commands[name] = counter
		success += counter.Success
		failure += counter.Failure
	}
	return map[string]any{
		"commandSuccessTotal":     success,
		"commandFailureTotal":     failure,
		"conflictTotal":           m.conflictTotal,
		"insufficientCreditTotal": m.insufficientCreditTotal,
		"settlementFailureTotal":  m.settlementFailureTotal,
		"commands":                commands,
	}
}

func (m *Metrics) reset() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.commands = map[string]*commandCounter{}
	m.conflictTotal, m.insufficientCreditTotal, m.settlementFailureTotal = 0, 0, 0
}

// metricsSnapshot is CourseCreditMetricsService.snapshot.
func metricsSnapshot(app core.App, metrics *Metrics, now time.Time) (map[string]any, error) {
	expired, err := list(app, "credit_batches", "expiredQuantity > 0", "")
	if err != nil {
		return nil, err
	}
	outbox, err := pageOf(app, "outbox_events", outboxBacklogFilter, "created", 1, 1)
	if err != nil {
		return nil, err
	}
	reconciliation, err := pageOf(app, "reconciliation_exceptions", `status="open"`, "", 1, 1)
	if err != nil {
		return nil, err
	}
	insufficient, err := pageOf(app, "session_students", `creditStatus="credit_insufficient"`, "", 1, 1)
	if err != nil {
		return nil, err
	}
	expiredQuantity := 0.0
	for _, batch := range expired {
		expiredQuantity += gaugeNumber(batch["expiredQuantity"])
	}
	var oldest any
	if len(outbox.Items) > 0 {
		oldest = outbox.Items[0]["created"]
	}
	return map[string]any{
		"collectedAt": iso(now),
		"counters":    metrics.snapshot(),
		"gauges": map[string]any{
			"expiredQuantity":          expiredQuantity,
			"insufficientReservations": gaugeNumber(insufficient.TotalItems),
			"outboxBacklog":            gaugeNumber(outbox.TotalItems),
			"outboxLagSeconds":         lagSeconds(oldest, now),
			"reconciliationDrift":      gaugeNumber(reconciliation.TotalItems),
		},
	}, nil
}

func normalizeCommandName(value string) string {
	if name := strings.TrimSpace(value); name != "" {
		return name
	}
	return "unknown"
}

// gaugeNumber is `Number(value)` clamped to a finite non-negative value.
func gaugeNumber(value any) float64 {
	number := jsx.Number(value)
	if math.IsNaN(number) || math.IsInf(number, 0) || number <= 0 {
		return 0
	}
	return number
}

func lagSeconds(created any, now time.Time) int64 {
	if !jsx.Truthy(created) {
		return 0
	}
	ms, ok := millis(created)
	if !ok {
		return 0
	}
	return max(0, int64(math.Floor(float64(now.UnixMilli()-ms)/1000)))
}

// errorCode is `error?.code` for business and store failures.
func errorCode(err error) string {
	var business *Error
	if errors.As(err, &business) {
		return business.Code
	}
	var store *storeError
	if errors.As(err, &store) {
		return store.code
	}
	return ""
}
