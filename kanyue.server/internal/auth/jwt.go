// Package auth signs and verifies tokens exactly like Hono's jsonwebtoken setup
// (HS256, shared JWT_SECRET, iat/exp in seconds), so existing sessions stay valid.
package auth

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	AppTokenTTL = 30 * 24 * time.Hour
	OpsTokenTTL = 12 * time.Hour
	OpsScope    = "ops"
)

type Claims = jwt.MapClaims

type Signer struct {
	secret []byte
	now    func() time.Time
}

func NewSigner(secret string) (*Signer, error) {
	if len(secret) < 32 {
		return nil, errors.New("JWT_SECRET must be at least 32 characters")
	}
	return &Signer{secret: []byte(secret), now: time.Now}, nil
}

// Sign builds {id, sn, role, isAdmin, ...extra} like Hono's jwtAuth.sign.
func (s *Signer) Sign(id, sn, role string, isAdmin bool, extra Claims, ttl time.Duration) (string, error) {
	claims := Claims{}
	for key, value := range extra {
		claims[key] = value
	}
	now := s.now()
	claims["id"], claims["sn"], claims["role"], claims["isAdmin"] = id, sn, role, isAdmin
	claims["iat"] = now.Unix()
	claims["exp"] = now.Add(ttl).Unix()
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.secret)
}

// Verify returns nil for any invalid or expired token, like Hono's jwtAuth.check.
func (s *Signer) Verify(token string) Claims {
	claims := Claims{}
	parsed, err := jwt.ParseWithClaims(token, claims, func(*jwt.Token) (any, error) {
		return s.secret, nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}), jwt.WithTimeFunc(s.now))
	if err != nil || !parsed.Valid {
		return nil
	}
	return claims
}

// SessionUser accepts app and ops tokens but never identity-challenge tokens.
func (s *Signer) SessionUser(token string) Claims {
	claims := s.Verify(token)
	if claims == nil || claims["challengeType"] != nil {
		return nil
	}
	return claims
}

// OpsUser additionally requires the short-lived Admin scope and a teacher-role account.
func (s *Signer) OpsUser(token string) Claims {
	claims := s.SessionUser(token)
	if claims == nil || claims["scope"] != OpsScope || claims["role"] != "teacher" {
		return nil
	}
	return claims
}
