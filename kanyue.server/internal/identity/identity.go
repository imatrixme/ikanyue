// Package identity owns mini program sign-in (password, WeChat, role selection,
// refresh, profile update) and Admin sign-in. Rules match Hono's user and ops auth routes.
package identity

import (
	"crypto/md5"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/auth"
	"kanyue.server/internal/config"
	"kanyue.server/internal/httpx"
)

type Module struct {
	Signer *auth.Signer
	Config config.Config
	// HTTPClient reaches WeChat; nil uses a 10s-timeout client.
	HTTPClient *http.Client
}

type service struct {
	signer   *auth.Signer
	cfg      config.Config
	wechat   wechatClient
	failures *throttle
}

func (m Module) Register(se *core.ServeEvent) {
	s := &service{
		signer:   m.Signer,
		cfg:      m.Config,
		wechat:   wechatClient{appID: m.Config.WechatAppID, secret: m.Config.WechatSecret, sessionURL: m.Config.WechatSessionURL, http: m.HTTPClient},
		failures: &throttle{entries: map[string]*attempts{}},
	}
	r := se.Router
	r.POST("/v1/user/login", s.login)
	r.POST("/v1/user/wechat-login", s.wechatLogin)
	r.POST("/v1/user/wechat-role-login", s.wechatRoleLogin)
	r.POST("/v1/user/update", s.signer.RequireSession(s.update))
	r.POST("/v1/user/refresh", s.signer.RequireSession(s.refresh))
	r.GET("/v1/user/wechat-roles", s.signer.RequireSession(s.wechatRoles))
	r.POST("/v1/user/switch-wechat-role", s.signer.RequireSession(s.switchWechatRole))

	r.POST("/ops/auth/login", s.opsLogin)
	r.POST("/ops/auth/register", s.opsRegister)
	r.GET("/ops/auth/me", s.signer.RequireOps(true, s.opsMe))
	r.POST("/ops/auth/change-password", s.signer.RequireOps(true, s.opsChangePassword))
}

// reply mirrors Hono's sendResult plus app.onError: coded errors are business
// envelopes, anything else escaped the handler and becomes HTTP 500.
func reply(e *core.RequestEvent, data any, err error) error {
	if err == nil {
		return httpx.Data(e, data)
	}
	var coded *httpx.CodedError
	if errors.As(err, &coded) {
		return httpx.Error(e, coded.Code, coded.Message)
	}
	return httpx.Internal(e, err)
}

const (
	failureLimit  = 5
	failureWindow = 15 * time.Minute
	failureCap    = 10_000
)

type attempts struct {
	count int
	since time.Time
}

// throttle limits password guessing per cellphone; process-local like Hono's.
type throttle struct {
	mu      sync.Mutex
	entries map[string]*attempts
}

func (t *throttle) blocked(key string) bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	entry := t.entries[key]
	if entry != nil && time.Since(entry.since) > failureWindow {
		delete(t.entries, key)
		return false
	}
	return entry != nil && entry.count >= failureLimit
}

func (t *throttle) fail(key string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	entry := t.entries[key]
	if entry == nil {
		if len(t.entries) >= failureCap {
			for other := range t.entries {
				delete(t.entries, other)
				break
			}
		}
		entry = &attempts{since: time.Now()}
		t.entries[key] = entry
	}
	entry.count++
}

func (t *throttle) clear(key string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	delete(t.entries, key)
}

func md5Hex(value string) string {
	sum := md5.Sum([]byte(value))
	return hex.EncodeToString(sum[:])
}

// teacherPasswordMatches stands in for Hono's PocketBase authWithPassword call;
// teachers authenticate by email only, so a teacher without email never matches.
func teacherPasswordMatches(teacher *core.Record, password string) bool {
	return teacher.Email() != "" && teacher.ValidatePassword(password)
}

func loginIP(e *core.RequestEvent, fallbackValue string) string {
	return firstNonEmpty(e.Request.Header.Get("X-Forwarded-For"), e.Request.Header.Get("X-Real-IP"), fallbackValue)
}

func randomBase36(length int) string {
	const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
	b := make([]byte, length)
	_, _ = rand.Read(b)
	for i := range b {
		b[i] = alphabet[int(b[i])%len(alphabet)]
	}
	return string(b)
}

// truthy is JavaScript truthiness for decoded JSON or form values.
func truthy(value any) bool {
	switch v := value.(type) {
	case nil:
		return false
	case bool:
		return v
	case string:
		return v != ""
	case float64:
		return v != 0
	}
	return true
}

// jsString is JavaScript String(value) for decoded JSON or form values.
func jsString(value any) string {
	switch v := value.(type) {
	case nil:
		return "null"
	case string:
		return v
	case bool:
		return strconv.FormatBool(v)
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64)
	case []any:
		parts := make([]string, len(v))
		for i, item := range v {
			if item != nil {
				parts[i] = jsString(item)
			}
		}
		return strings.Join(parts, ",")
	}
	return "[object Object]"
}

// firstTruthy returns the first truthy value among keys, like `a || b || c`.
func firstTruthy(body httpx.Body, keys ...string) any {
	for _, key := range keys {
		if truthy(body[key]) {
			return body[key]
		}
	}
	return nil
}

// normalizeString is Hono's opsUtils.normalizeString: trimmed strings only.
func normalizeString(value any) string {
	text, _ := value.(string)
	return strings.TrimSpace(text)
}
