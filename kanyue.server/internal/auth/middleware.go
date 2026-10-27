package auth

import (
	"strings"

	"github.com/pocketbase/pocketbase/core"

	"kanyue.server/internal/httpx"
)

const userKey = "kanyueUser"

// Token reads `token`/`jwtoken` headers first, then `Authorization: Bearer`, like Hono.
func Token(e *core.RequestEvent) string {
	if token := e.Request.Header.Get("token"); token != "" {
		return strings.TrimSpace(token)
	}
	if token := e.Request.Header.Get("jwtoken"); token != "" {
		return strings.TrimSpace(token)
	}
	bearer := e.Request.Header.Get("Authorization")
	if strings.HasPrefix(strings.ToLower(bearer), "bearer ") {
		return strings.TrimSpace(bearer[7:])
	}
	return strings.TrimSpace(bearer)
}

func User(e *core.RequestEvent) Claims {
	claims, _ := e.Get(userKey).(Claims)
	return claims
}

// RequireSession is Hono's authMiddleware for mini program routes.
func (s *Signer) RequireSession(next func(*core.RequestEvent) error) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		token := Token(e)
		if token == "" {
			return httpx.SessionInvalid(e, "未授权，请登录后操作")
		}
		claims := s.SessionUser(token)
		if claims == nil {
			return httpx.SessionInvalid(e, "登录已失效，请重新登录")
		}
		e.Set(userKey, claims)
		return next(e)
	}
}

// RequireOps is Hono's opsAuthMiddleware; allowPasswordChange skips the
// first-login password guard (only /ops/auth/me and change-password).
func (s *Signer) RequireOps(allowPasswordChange bool, next func(*core.RequestEvent) error) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		token := Token(e)
		if token == "" {
			return httpx.Error(e, 403, "后台未登录")
		}
		claims := s.SessionUser(token)
		if claims == nil || claims["scope"] != OpsScope {
			return httpx.Error(e, 403, "后台登录已过期，请重新登录")
		}
		if claims["role"] != "teacher" {
			return httpx.Error(e, 403, "后台仅允许教师或管理员访问")
		}
		if !allowPasswordChange && claims["passwordChangeRequired"] == true {
			return httpx.Error(e, 403, "首次登录必须先修改默认密码")
		}
		e.Set(userKey, claims)
		return next(e)
	}
}

func ClaimString(claims Claims, key string) string {
	value, _ := claims[key].(string)
	return value
}

func ClaimBool(claims Claims, key string) bool {
	value, _ := claims[key].(bool)
	return value
}
