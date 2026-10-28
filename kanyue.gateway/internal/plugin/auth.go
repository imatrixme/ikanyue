package plugin

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"hash"
	"io"
	"mime"
	"net/http"
	"net/url"
	"slices"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func init() {
	register(jwtAuth)
	register(aliyunSignature)
	register(replayGuard)
}

// jwt-auth accepts exactly what kanyue.server accepts: HS256 with the shared
// secret, unexpired, never an identity-challenge token; optionally a scope and roles.
var jwtAuth = define("jwt-auth", 790, `{"type":"object","additionalProperties":false,"required":["secret"],"properties":{
	"secret":{"type":"string","minLength":1,"maxLength":100},
	"scope":{"type":"string","maxLength":50},
	"roles":{"type":"array","maxItems":20,"items":{"type":"string","maxLength":50}},
	"userClaim":{"type":"string","maxLength":50}}}`,
	func(c struct {
		Secret    string   `json:"secret"`
		Scope     string   `json:"scope"`
		Roles     []string `json:"roles"`
		UserClaim string   `json:"userClaim"`
	}, scope Scope) (Instance, error) {
		if scope.Secret == nil {
			return nil, errors.New("secrets are not available")
		}
		secret, err := scope.Secret(c.Secret)
		if err != nil {
			return nil, err
		}
		if len(secret) < 32 {
			return nil, fmt.Errorf("secret %q must be at least 32 characters", c.Secret)
		}
		now := time.Now
		if scope.Now != nil {
			now = scope.Now
		}
		return &jwtCheck{secret: []byte(secret), scope: c.Scope, roles: c.Roles, userClaim: orString(c.UserClaim, "id"), now: now}, nil
	})

type jwtCheck struct {
	secret    []byte
	scope     string
	roles     []string
	userClaim string
	now       func() time.Time
}

// sessionInvalid makes the mini program drop its session, as kanyue.server's answer does.
func sessionInvalid(message string) *Reply {
	return &Reply{Status: http.StatusUnauthorized, Message: message, ErrorCode: "AUTH_SESSION_INVALID", Reason: "Invalid JWT"}
}

func (j *jwtCheck) Request(ctx *Context) *Reply {
	token := bearerToken(ctx.Request.Header)
	if token == "" {
		return sessionInvalid("未授权，请登录后操作")
	}
	claims := jwt.MapClaims{}
	parsed, err := jwt.ParseWithClaims(token, claims, func(*jwt.Token) (any, error) { return j.secret, nil },
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}), jwt.WithTimeFunc(j.now))
	if err != nil || !parsed.Valid || claims["challengeType"] != nil {
		return sessionInvalid("登录已失效，请重新登录")
	}
	if j.scope != "" && claims["scope"] != j.scope {
		return sessionInvalid("登录已失效，请重新登录")
	}
	if len(j.roles) > 0 {
		role, _ := claims["role"].(string)
		if !slices.Contains(j.roles, role) {
			return Fail(http.StatusForbidden, "无权访问", "Role not allowed")
		}
	}
	ctx.User = fmt.Sprint(claims[j.userClaim])
	return nil
}

// bearerToken reads token, jwtoken, then Authorization, like kanyue.server.
func bearerToken(header http.Header) string {
	for _, key := range []string{"token", "jwtoken"} {
		if value := strings.TrimSpace(header.Get(key)); value != "" {
			return value
		}
	}
	value := strings.TrimSpace(header.Get("Authorization"))
	if len(value) > 7 && strings.EqualFold(value[:7], "bearer ") {
		return strings.TrimSpace(value[7:])
	}
	return value
}

// aliyun-signature verifies Aliyun API Gateway's AppKey signature (X-Ca-Key,
// X-Ca-Signature, HmacSHA256 or HmacSHA1) against registered consumers. An empty
// consumers list lets every registered consumer in, unless private is set: a
// private API admits only the listed (granted) consumers, so no grant means nobody.
var aliyunSignature = define("aliyun-signature", 800, `{"type":"object","additionalProperties":false,"properties":{
	"consumers":{"type":"array","maxItems":500,"items":{"type":"string","maxLength":60}},
	"private":{"type":"boolean"}}}`,
	func(c struct {
		Consumers []string `json:"consumers"`
		Private   bool     `json:"private"`
	}, scope Scope) (Instance, error) {
		now := time.Now
		if scope.Now != nil {
			now = scope.Now
		}
		return &signatureCheck{env: scope.Env, allowed: c.Consumers, private: c.Private, now: now}, nil
	})

type signatureCheck struct {
	env     *Env
	allowed []string
	private bool
	now     func() time.Time
}

// signatureWindow is how far X-Ca-Timestamp may be from now, as on Aliyun.
const signatureWindow = 15 * time.Minute

const formLimit = 1 << 20

func (s *signatureCheck) Request(ctx *Context) *Reply {
	r := ctx.Request
	key := r.Header.Get("X-Ca-Key")
	consumer, ok := s.env.Consumers[key]
	if key == "" || !ok {
		return Fail(http.StatusBadRequest, "签名校验失败", "Invalid AppKey")
	}
	if (s.private || len(s.allowed) > 0) && !slices.Contains(s.allowed, consumer.Name) {
		return Fail(http.StatusForbidden, "无权访问", "Unauthorized")
	}
	if stamp := r.Header.Get("X-Ca-Timestamp"); stamp != "" && !withinWindow(stamp, s.now(), signatureWindow) {
		return Fail(http.StatusBadRequest, "签名已过期", "Invalid Timestamp")
	}
	var newHash func() hash.Hash
	switch r.Header.Get("X-Ca-Signature-Method") {
	case "", "HmacSHA256":
		newHash = sha256.New
	case "HmacSHA1":
		newHash = sha1.New
	default:
		return Fail(http.StatusBadRequest, "签名校验失败", "Invalid Signature Method")
	}
	toSign, err := StringToSign(r)
	if err != nil {
		return Fail(http.StatusBadRequest, "签名校验失败", "Invalid Request Body")
	}
	mac := hmac.New(newHash, []byte(consumer.Secret))
	mac.Write([]byte(toSign))
	expected := base64.StdEncoding.EncodeToString(mac.Sum(nil))
	if subtle.ConstantTimeCompare([]byte(expected), []byte(r.Header.Get("X-Ca-Signature"))) != 1 {
		return Fail(http.StatusBadRequest, "签名校验失败",
			"Invalid Signature, Server StringToSign:`"+strings.ReplaceAll(toSign, "\n", "#")+"`")
	}
	ctx.Consumer, ctx.Signed = consumer.Name, true
	return nil
}

// signedHeaderSkip are never part of the Headers block, even when listed.
var signedHeaderSkip = map[string]bool{"x-ca-signature": true, "x-ca-signature-headers": true, "accept": true,
	"content-md5": true, "content-type": true, "date": true}

// StringToSign follows Aliyun's rule: method, Accept, Content-MD5, Content-Type,
// Date, the X-Ca-Signature-Headers in key order, then the path with sorted query
// and form parameters, unescaped. Form bodies are read and restored.
func StringToSign(r *http.Request) (string, error) {
	var b strings.Builder
	for _, value := range []string{r.Method, r.Header.Get("Accept"), r.Header.Get("Content-MD5"),
		r.Header.Get("Content-Type"), r.Header.Get("Date")} {
		b.WriteString(value)
		b.WriteByte('\n')
	}
	var names []string
	for _, name := range strings.Split(r.Header.Get("X-Ca-Signature-Headers"), ",") {
		if name = strings.TrimSpace(name); name != "" && !signedHeaderSkip[strings.ToLower(name)] {
			names = append(names, name)
		}
	}
	sort.Strings(names)
	for _, name := range names {
		b.WriteString(name + ":" + strings.TrimSpace(r.Header.Get(name)) + "\n")
	}
	params := url.Values{}
	for key, values := range r.URL.Query() {
		params[key] = append(params[key], values...)
	}
	if mediaType, _, _ := mime.ParseMediaType(r.Header.Get("Content-Type")); mediaType == "application/x-www-form-urlencoded" && r.Body != nil {
		raw, err := io.ReadAll(io.LimitReader(r.Body, formLimit+1))
		if err != nil || len(raw) > formLimit {
			return "", errors.New("form body unreadable or too large")
		}
		r.Body = io.NopCloser(bytes.NewReader(raw))
		form, err := url.ParseQuery(string(raw))
		if err != nil {
			return "", err
		}
		for key, values := range form {
			params[key] = append(params[key], values...)
		}
	}
	b.WriteString(r.URL.Path)
	if len(params) > 0 {
		keys := make([]string, 0, len(params))
		for key := range params {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		parts := make([]string, 0, len(keys))
		for _, key := range keys {
			if value := params[key][0]; value != "" {
				parts = append(parts, key+"="+value)
			} else {
				parts = append(parts, key)
			}
		}
		b.WriteString("?" + strings.Join(parts, "&"))
	}
	return b.String(), nil
}

func withinWindow(millis string, now time.Time, window time.Duration) bool {
	ms, err := strconv.ParseInt(millis, 10, 64)
	if err != nil {
		return false
	}
	delta := now.Sub(time.UnixMilli(ms))
	return delta <= window && delta >= -window
}

// replay-guard rejects a signed request whose timestamp is outside the window
// or whose nonce was already used; like Aliyun it applies to signed requests only.
var replayGuard = define("replay-guard", 780, `{"type":"object","additionalProperties":false,"properties":{
	"windowSeconds":{"type":"integer","minimum":1,"maximum":3600}}}`,
	func(c struct {
		WindowSeconds int `json:"windowSeconds"`
	}, scope Scope) (Instance, error) {
		if scope.Nonces == nil {
			return nil, errors.New("nonce store is not available")
		}
		now := time.Now
		if scope.Now != nil {
			now = scope.Now
		}
		return &replayCheck{nonces: scope.Nonces, window: time.Duration(orInt(c.WindowSeconds, 900)) * time.Second, now: now}, nil
	})

type replayCheck struct {
	nonces *Nonces
	window time.Duration
	now    func() time.Time
}

func (g *replayCheck) Request(ctx *Context) *Reply {
	if !ctx.Signed {
		return nil
	}
	now := g.now()
	if !withinWindow(ctx.Request.Header.Get("X-Ca-Timestamp"), now, g.window) {
		return Fail(http.StatusBadRequest, "请求已过期", "Invalid Timestamp")
	}
	nonce := ctx.Request.Header.Get("X-Ca-Nonce")
	if nonce == "" || len(nonce) > 128 || !g.nonces.Use(ctx.Consumer+"\x00"+nonce, now, g.window) {
		return Fail(http.StatusBadRequest, "重复的请求", "Nonce Used")
	}
	return nil
}

// Nonces remembers used nonces until their window passes.
type Nonces struct {
	mu        sync.Mutex
	seen      map[string]time.Time
	lastSweep time.Time
}

func NewNonces() *Nonces { return &Nonces{seen: map[string]time.Time{}} }

// Use records key and reports whether it was unused within the window.
func (n *Nonces) Use(key string, now time.Time, window time.Duration) bool {
	n.mu.Lock()
	defer n.mu.Unlock()
	if now.Sub(n.lastSweep) > time.Minute {
		for k, expires := range n.seen {
			if now.After(expires) {
				delete(n.seen, k)
			}
		}
		n.lastSweep = now
	}
	if expires, used := n.seen[key]; used && now.Before(expires) {
		return false
	}
	n.seen[key] = now.Add(2 * window) // a timestamp may be up to one window in the future
	return true
}
