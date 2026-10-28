package control

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/x509"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"kanyue.gateway/internal/proxy"
	"kanyue.gateway/internal/schema"
)

// Alert rules are evaluated every minute. A rule's template turns the current
// state into findings, one per subject (a route, a service, a file); a finding
// that lasts forMinutes fires, and its disappearance sends a recovery notice.

type finding struct {
	value   float64
	message string
}

type alertState struct {
	since   time.Time
	firing  bool
	finding finding
}

type alertBook struct {
	mu     sync.Mutex
	states map[string]*alertState // rule id + subject
	// dropped total at the previous evaluation, for the per-minute delta
	lastDropped atomic.Int64
}

// Notice is what channels receive when a rule fires or resolves.
type Notice struct {
	Rule     string    `json:"rule"`
	Template string    `json:"template"`
	Subject  string    `json:"subject"`
	State    string    `json:"state"` // firing or resolved
	Value    float64   `json:"value"`
	Message  string    `json:"message"`
	At       time.Time `json:"at"`
}

func (n Notice) text() string {
	if n.State == "resolved" {
		return fmt.Sprintf("【恢复】%s：%s 已恢复（%s）", n.Rule, n.Subject, n.At.In(chinaTime).Format("01-02 15:04"))
	}
	return fmt.Sprintf("【告警】%s：%s（%s）", n.Rule, n.Message, n.At.In(chinaTime).Format("01-02 15:04"))
}

var chinaTime = time.FixedZone("CST", 8*3600)

// EvaluateAlerts checks every enabled rule at now and notifies on changes.
func (c *Control) EvaluateAlerts(ctx context.Context, now time.Time) error {
	rules, err := c.app.FindAllRecords(schema.AlertRules, dbx.HashExp{"enabled": true})
	if err != nil {
		return err
	}
	state := c.alertInputs(ctx, now)
	book := &c.alerts
	book.mu.Lock()
	if book.states == nil {
		book.states = map[string]*alertState{}
	}
	var notices []struct {
		rule   *core.Record
		notice Notice
	}
	live := map[string]bool{}
	for _, rule := range rules {
		findings := c.findings(rule, state, now)
		forDuration := time.Duration(rule.GetInt("forMinutes")) * time.Minute
		for subject, f := range findings {
			key := rule.Id + "\x00" + subject
			live[key] = true
			s := book.states[key]
			if s == nil {
				s = &alertState{since: now}
				book.states[key] = s
			}
			s.finding = f
			if !s.firing && now.Sub(s.since) >= forDuration {
				s.firing = true
				notices = append(notices, struct {
					rule   *core.Record
					notice Notice
				}{rule, Notice{Rule: rule.GetString("name"), Template: rule.GetString("template"), Subject: subject,
					State: "firing", Value: f.value, Message: f.message, At: now}})
			}
		}
		for key, s := range book.states {
			if !strings.HasPrefix(key, rule.Id+"\x00") || live[key] {
				continue
			}
			if s.firing {
				subject := strings.TrimPrefix(key, rule.Id+"\x00")
				notices = append(notices, struct {
					rule   *core.Record
					notice Notice
				}{rule, Notice{Rule: rule.GetString("name"), Template: rule.GetString("template"), Subject: subject,
					State: "resolved", Value: s.finding.value, Message: s.finding.message, At: now}})
			}
			delete(book.states, key)
		}
	}
	// Rules that were disabled or deleted stop silently.
	enabled := map[string]bool{}
	for _, rule := range rules {
		enabled[rule.Id] = true
	}
	for key := range book.states {
		if !enabled[strings.SplitN(key, "\x00", 2)[0]] {
			delete(book.states, key)
		}
	}
	book.mu.Unlock()

	for _, n := range notices {
		c.deliver(ctx, n.rule, n.notice)
	}
	return nil
}

// alertInputs gathers what the templates read, once per evaluation.
type alertInputs struct {
	window   map[string][2]float64 // route → count, 5xx, from the last finished minute
	p95      map[string]float64
	calls    map[string][2]int // target → count, failures over the last finished minute
	dropped  int64             // since the previous evaluation
	failing  map[string]time.Time
	reports  []Report
	services map[string]string // service id → name
}

func (c *Control) alertInputs(ctx context.Context, now time.Time) alertInputs {
	in := alertInputs{window: map[string][2]float64{}, p95: map[string]float64{}, calls: map[string][2]int{},
		failing: map[string]time.Time{}, reports: c.Reports(), services: map[string]string{}}
	minute := now.Truncate(time.Minute)
	if tel := c.Telemetry(); tel != nil {
		if summaries, err := tel.Window(ctx, minute.Add(-time.Minute), minute); err == nil {
			for _, s := range summaries {
				in.window[s.Route] = [2]float64{float64(s.Count), float64(s.S5xx)}
				in.p95[s.Route] = s.P95
			}
		}
		if calls, err := tel.Calls(ctx, minute.Add(-time.Minute), minute); err == nil {
			for _, call := range calls {
				previous := in.calls[call.Target]
				in.calls[call.Target] = [2]int{previous[0] + call.Count, previous[1] + call.Failures}
			}
		}
		total := tel.Dropped() + tel.ExportDropped() + c.handler.MirrorDropped()
		in.dropped = total - c.alerts.lastDropped.Swap(total)
		for _, export := range tel.Exports() {
			if !export.FailingSince.IsZero() {
				in.failing[export.Name] = export.FailingSince
			}
		}
	}
	if services, err := c.app.FindAllRecords(schema.Services); err == nil {
		for _, service := range services {
			in.services[service.Id] = service.GetString("name")
		}
	}
	return in
}

// minRequests keeps a handful of requests from setting off ratio and latency rules.
const minRequests = 20

func matches(target, subject string) bool {
	return target == "" || target == subject
}

// findings evaluates one rule's template; the threshold defaults per template.
func (c *Control) findings(rule *core.Record, in alertInputs, now time.Time) map[string]finding {
	target := strings.TrimSpace(rule.GetString("target"))
	threshold := rule.GetFloat("threshold")
	or := func(fallback float64) float64 {
		if threshold > 0 {
			return threshold
		}
		return fallback
	}
	out := map[string]finding{}
	switch rule.GetString("template") {
	case "5xx-ratio":
		limit := or(0.05)
		for route, w := range in.window {
			if matches(target, route) && w[0] >= minRequests && w[1]/w[0] >= limit {
				out[route] = finding{w[1] / w[0], fmt.Sprintf("路由 %s 上一分钟 5xx 比例 %.1f%%（%d/%d）", route, 100*w[1]/w[0], int(w[1]), int(w[0]))}
			}
		}
	case "p95-latency":
		limit := or(1000)
		for route, p95 := range in.p95 {
			if matches(target, route) && in.window[route][0] >= minRequests && p95 >= limit {
				out[route] = finding{p95, fmt.Sprintf("路由 %s 上一分钟 P95 %.0f ms", route, p95)}
			}
		}
	case "no-healthy-instance":
		routes := c.handler.Routes()
		affected := map[string][]string{}
		if routes != nil {
			for _, service := range routes.Services() {
				affected[service.ID] = nil
			}
		}
		if records, err := c.app.FindAllRecords(schema.Routes, dbx.HashExp{"enabled": true}); err == nil {
			for _, route := range records {
				if list, routed := affected[route.GetString("service")]; routed {
					affected[route.GetString("service")] = append(list, route.GetString("name"))
				}
			}
		}
		for id, names := range affected {
			name := in.services[id]
			if healthy, _ := c.handler.Endpoints().Healthy(id, proxy.DefaultStage, now); healthy == 0 && matches(target, name) {
				sort.Strings(names)
				out[name] = finding{0, fmt.Sprintf("服务 %s 没有健康实例，受影响路由：%s", name, strings.Join(names, "、"))}
			}
		}
	case "breaker-open":
		for _, signal := range c.handler.Signals() {
			if signal.Kind == "breaker" && matches(target, signal.Key) {
				out[signal.Key] = finding{1, fmt.Sprintf("路由 %s 熔断已打开（自 %s）", signal.Key, signal.Since.In(chinaTime).Format("15:04:05"))}
			}
		}
	case "outbound-failures":
		if target == "" {
			target = "payment-callback"
		}
		limit := or(1)
		if call := in.calls[target]; float64(call[1]) >= limit {
			out[target] = finding{float64(call[1]), fmt.Sprintf("外部调用 %s 上一分钟失败 %d 次（共 %d 次）", target, call[1], call[0])}
		}
	case "outbox-dead-letters":
		limit := or(1)
		for _, report := range in.reports {
			if value, ok := report.Gauges["outboxDeadLetters"]; ok && value >= limit && matches(target, report.Service) {
				out[report.Service] = finding{value, fmt.Sprintf("%s 的 outbox 死信积压 %.0f 条", report.Service, value)}
			}
		}
	case "dropped-logs":
		if limit := or(1); float64(in.dropped) >= limit {
			out["telemetry"] = finding{float64(in.dropped), fmt.Sprintf("上一分钟丢弃了 %d 条日志或镜像请求（队列已满或导出失败）", in.dropped)}
		}
	case "export-failing":
		for name, since := range in.failing {
			if matches(target, name) {
				out[name] = finding{now.Sub(since).Minutes(), fmt.Sprintf("日志导出 %s 自 %s 起持续失败", name, since.In(chinaTime).Format("15:04"))}
			}
		}
	case "backup-overdue":
		limit := time.Duration(or(26) * float64(time.Hour))
		for _, report := range in.reports {
			if !matches(target, report.Service) {
				continue
			}
			switch backup := report.Backup; {
			case backup == nil:
				out[report.Service] = finding{0, fmt.Sprintf("%s 还没有上报过备份", report.Service)}
			case !backup.OK:
				out[report.Service] = finding{0, fmt.Sprintf("%s 最近一次备份失败：%s", report.Service, backup.Error)}
			case now.Sub(backup.At) > limit:
				out[report.Service] = finding{now.Sub(backup.At).Hours(), fmt.Sprintf("%s 已 %.0f 小时没有成功备份", report.Service, now.Sub(backup.At).Hours())}
			}
		}
	case "certificate-expiry":
		days := or(14)
		for _, pattern := range strings.Fields(strings.ReplaceAll(target, ",", " ")) {
			files, _ := filepath.Glob(pattern)
			for _, file := range files {
				notAfter, err := certificateExpiry(file)
				left := notAfter.Sub(now).Hours() / 24
				switch {
				case err != nil:
					out[file] = finding{0, fmt.Sprintf("证书 %s 无法读取：%v", file, err)}
				case left <= days:
					out[file] = finding{left, fmt.Sprintf("证书 %s 将在 %.0f 天后（%s）过期", file, left, notAfter.In(chinaTime).Format("2006-01-02"))}
				}
			}
		}
	case "operation-removed":
		removed, err := c.app.FindAllRecords(schema.Operations, dbx.HashExp{"status": "removed"})
		if err != nil {
			break
		}
		routes, _ := c.app.FindAllRecords(schema.Routes, dbx.HashExp{"enabled": true})
		for _, op := range removed {
			for _, route := range routes {
				for _, id := range route.GetStringSlice("operations") {
					if id == op.Id {
						subject := op.GetString("method") + " " + op.GetString("path")
						out[subject] = finding{0, fmt.Sprintf("路由 %s 选中的接口 %s 已从服务清单移除", route.GetString("name"), subject)}
					}
				}
			}
		}
	}
	return out
}

func certificateExpiry(file string) (time.Time, error) {
	raw, err := os.ReadFile(file)
	if err != nil {
		return time.Time{}, err
	}
	block, _ := pem.Decode(raw)
	if block == nil {
		return time.Time{}, fmt.Errorf("no PEM certificate")
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return time.Time{}, err
	}
	return cert.NotAfter, nil
}

// deliver sends a notice to the rule's enabled channels and records it as an event.
func (c *Control) deliver(ctx context.Context, rule *core.Record, notice Notice) {
	if tel := c.Telemetry(); tel != nil {
		tel.Event("alert", notice.text(), map[string]any{"rule": notice.Rule, "template": notice.Template,
			"subject": notice.Subject, "state": notice.State, "value": notice.Value}, notice.At)
	}
	c.app.Logger().Warn("Alert "+notice.State, "rule", notice.Rule, "subject", notice.Subject, "message", notice.Message)
	ids := rule.GetStringSlice("channels")
	if len(ids) == 0 {
		return
	}
	channels, err := c.app.FindRecordsByIds(schema.AlertChannels, ids)
	if err != nil {
		return
	}
	for _, channel := range channels {
		if !channel.GetBool("enabled") {
			continue
		}
		go func() {
			for attempt, pause := range []time.Duration{0, 5 * time.Second, 30 * time.Second} {
				time.Sleep(pause)
				err := c.send(ctx, channel, notice)
				if err == nil {
					return
				}
				c.app.Logger().Warn("Alert delivery failed", "channel", channel.GetString("name"), "attempt", attempt+1, "error", err.Error())
			}
		}()
	}
}

// send posts one notice in the channel's format. Webhooks carry
// X-Kanyue-Timestamp and X-Kanyue-Signature: sha256=HMAC(secret, timestamp + "." + body).
func (c *Control) send(ctx context.Context, channel *core.Record, notice Notice) error {
	var payload any
	switch channel.GetString("kind") {
	case "wecom":
		payload = map[string]any{"msgtype": "text", "text": map[string]any{"content": notice.text()}}
	case "feishu":
		payload = map[string]any{"msg_type": "text", "content": map[string]any{"text": notice.text()}}
	case "dingtalk":
		payload = map[string]any{"msgtype": "text", "text": map[string]any{"content": notice.text()}}
	default:
		payload = notice
	}
	body, _ := json.Marshal(payload)
	send, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(send, http.MethodPost, channel.GetString("url"), bytes.NewReader(body))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", "application/json")
	if sealed := channel.GetString("secret"); sealed != "" && channel.GetString("kind") == "webhook" {
		secret, err := c.open(sealed)
		if err != nil {
			return err
		}
		stamp := fmt.Sprint(time.Now().Unix())
		mac := hmac.New(sha256.New, []byte(secret))
		mac.Write([]byte(stamp + "."))
		mac.Write(body)
		request.Header.Set("X-Kanyue-Timestamp", stamp)
		request.Header.Set("X-Kanyue-Signature", "sha256="+hex.EncodeToString(mac.Sum(nil)))
	}
	response, err := c.client.Do(request)
	if err != nil {
		return err
	}
	response.Body.Close()
	if response.StatusCode/100 != 2 {
		return fmt.Errorf("channel answered %d", response.StatusCode)
	}
	return nil
}
