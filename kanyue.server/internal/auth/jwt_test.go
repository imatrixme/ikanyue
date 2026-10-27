package auth

import (
	"encoding/json"
	"os"
	"testing"
	"time"
)

// Test-only secret shared with the fixture generator; never used outside tests.
const fixtureSecret = "spike-secret-0123456789abcdef0123456789"

// Fixtures were signed by Hono's jsonwebtoken dependency with fixtureSecret:
// jwt.sign({...claims, iat: 2026-01-01, exp: 2099-01-01}, fixtureSecret), plus one token already expired.
func loadFixtures(t *testing.T) map[string]string {
	t.Helper()
	raw, err := os.ReadFile("testdata/jsonwebtoken-fixtures.json")
	if err != nil {
		t.Fatal(err)
	}
	fixtures := map[string]string{}
	if err := json.Unmarshal(raw, &fixtures); err != nil {
		t.Fatal(err)
	}
	return fixtures
}

func newSigner(t *testing.T) *Signer {
	t.Helper()
	signer, err := NewSigner(fixtureSecret)
	if err != nil {
		t.Fatal(err)
	}
	return signer
}

func TestAcceptsHonoTokens(t *testing.T) {
	signer, fixtures := newSigner(t), loadFixtures(t)

	app := signer.SessionUser(fixtures["app"])
	if app == nil || app["id"] != "s1" || app["role"] != "student" {
		t.Fatalf("app token rejected: %v", app)
	}
	if signer.OpsUser(fixtures["app"]) != nil {
		t.Fatal("app token must not reach ops")
	}
	if ops := signer.OpsUser(fixtures["ops"]); ops == nil || ops["isAdmin"] != true {
		t.Fatalf("ops token rejected: %v", ops)
	}
}

func TestRejectsChallengeExpiredAndForeignTokens(t *testing.T) {
	signer, fixtures := newSigner(t), loadFixtures(t)

	if signer.Verify(fixtures["challenge"]) == nil {
		t.Fatal("challenge token should still be a valid signature")
	}
	if signer.SessionUser(fixtures["challenge"]) != nil {
		t.Fatal("challenge token must not authenticate")
	}
	if signer.SessionUser(fixtures["expired"]) != nil {
		t.Fatal("expired token accepted")
	}
	other, _ := NewSigner("another-secret-that-is-at-least-32-chars")
	if other.SessionUser(fixtures["app"]) != nil {
		t.Fatal("token signed with another secret accepted")
	}
}

func TestSignMatchesHonoClaims(t *testing.T) {
	signer := newSigner(t)
	signer.now = func() time.Time { return time.Unix(1_800_000_000, 0) }

	token, err := signer.Sign("t1", "SN2", "teacher", true, Claims{"scope": OpsScope}, OpsTokenTTL)
	if err != nil {
		t.Fatal(err)
	}
	claims := signer.OpsUser(token)
	if claims == nil {
		t.Fatal("own ops token rejected")
	}
	if claims["iat"] != float64(1_800_000_000) || claims["exp"] != float64(1_800_000_000+12*3600) {
		t.Fatalf("unexpected iat/exp: %v %v", claims["iat"], claims["exp"])
	}
}

func TestShortSecretRefused(t *testing.T) {
	if _, err := NewSigner("short"); err == nil {
		t.Fatal("short secret accepted")
	}
}
