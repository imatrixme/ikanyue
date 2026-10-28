package control

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	"kanyue.gateway/internal/schema"
)

// RFC 6238 appendix B, SHA-1, truncated to 6 digits.
func TestTOTPReferenceCodes(t *testing.T) {
	secret := []byte("12345678901234567890")
	for unix, want := range map[int64]string{59: "287082", 1111111109: "081804", 1234567890: "005924", 2000000000: "279037"} {
		if got := totpCode(secret, unix/totpStep); got != want {
			t.Fatalf("code at %d = %s, want %s", unix, got, want)
		}
	}
	now := time.Unix(1111111109, 0)
	if matchTOTP(secret, "081804", now.Add(29*time.Second)) == 0 || matchTOTP(secret, "081804", now.Add(2*time.Minute)) != 0 {
		t.Fatal("drift window is not one step")
	}
}

// A superuser signs in with the password and then the current authenticator
// code; the emailed code path is closed, and a code works once.
func TestSuperuserSignInNeedsTOTP(t *testing.T) {
	c, app := newControl(t)
	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	c.routes(&core.ServeEvent{App: app, Router: router})
	mux, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}
	post := func(path string, body map[string]any) (int, map[string]any) {
		raw, _ := json.Marshal(body)
		request := httptest.NewRequest(http.MethodPost, "/api/collections/_superusers/"+path, strings.NewReader(string(raw)))
		request.Header.Set("Content-Type", "application/json")
		recorder := httptest.NewRecorder()
		mux.ServeHTTP(recorder, request)
		out := map[string]any{}
		json.Unmarshal(recorder.Body.Bytes(), &out)
		return recorder.Code, out
	}

	password := strings.Repeat("pw-", 4)
	superusers, _ := app.FindCollectionByNameOrId(core.CollectionNameSuperusers)
	admin := core.NewRecord(superusers)
	admin.SetEmail("ops@example.com")
	admin.SetPassword(password)
	if err := app.Save(admin); err != nil {
		t.Fatal(err)
	}
	signIn := func(code string) (int, map[string]any) {
		status, body := post("auth-with-password", map[string]any{"identity": "ops@example.com", "password": password})
		if status != http.StatusUnauthorized || body["mfaId"] == nil {
			t.Fatalf("password alone = %d %v", status, body)
		}
		mfaID := body["mfaId"]
		_, otp := post("request-otp", map[string]any{"email": "ops@example.com"})
		return post("auth-with-otp", map[string]any{"otpId": otp["otpId"], "password": code, "mfaId": mfaID})
	}

	if status, _ := signIn("123456"); status != http.StatusBadRequest {
		t.Fatalf("signed in without an authenticator: %d", status)
	}
	uri, err := c.EnrollTOTP("ops@example.com")
	if err != nil {
		t.Fatal(err)
	}
	parsed, _ := url.Parse(uri)
	secret, err := totpEncoding.DecodeString(parsed.Query().Get("secret"))
	if err != nil {
		t.Fatal(err)
	}
	stored, _ := app.FindFirstRecordByData(schema.SuperuserTOTP, "superuser", admin.Id)
	if !strings.HasPrefix(stored.GetString("secret"), sealedPrefix) {
		t.Fatal("authenticator secret stored unsealed")
	}
	code := totpCode(secret, time.Now().Unix()/totpStep)
	if status, body := signIn(code); status != http.StatusOK || body["token"] == nil {
		t.Fatalf("sign in with the current code = %d %v", status, body)
	}
	if status, _ := signIn(code); status != http.StatusBadRequest {
		t.Fatalf("a used code signed in again: %d", status)
	}
	if err := c.RemoveTOTP("ops@example.com"); err != nil {
		t.Fatal(err)
	}
	if status, _ := signIn(totpCode(secret, time.Now().Unix()/totpStep+1)); status != http.StatusBadRequest {
		t.Fatalf("signed in after the authenticator was removed: %d", status)
	}
}
