package pay

import (
	"net/url"
	"os"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"
)

// Config is read once from the environment. The HTTP address and data directory
// are PocketBase's serve flags (--http, --dir), not environment variables.
type Config struct {
	Mode           string
	Provider       string
	Live           bool
	CredentialFile string
	Events         *EventTarget
	Token          string
	MockToken      string
	Owner          string
	Interval       time.Duration
}

func Environ() map[string]string {
	env := map[string]string{}
	for _, entry := range os.Environ() {
		if key, value, ok := strings.Cut(entry, "="); ok {
			env[key] = value
		}
	}
	return env
}

var ownerPattern = regexp.MustCompile(`^[a-zA-Z0-9_-]{1,64}$`)

// LoadConfig fails closed: mock providers never run in production, and live
// WeChat needs an explicit release approval and no mock secret.
func LoadConfig(env map[string]string) (Config, error) {
	get := func(key, fallback string) string {
		if value := env[key]; value != "" {
			return value
		}
		return fallback
	}
	mode, provider := get("NODE_ENV", "development"), get("PAY_PROVIDER", "mock")
	mock := provider == "mock" || provider == "wechatpay-mock"
	if !slices.Contains([]string{"development", "test", "production"}, mode) {
		return Config{}, fail("INVALID_ENVIRONMENT", 400)
	}
	if mode == "production" && mock {
		return Config{}, fail("MOCK_FORBIDDEN_IN_PRODUCTION", 400)
	}
	live := provider == "wechatpay" && mode == "production" && env["PAY_LIVE_ENABLED"] == "true" &&
		env["PAY_RELEASE_APPROVAL"] == "merchant-live-acceptance-approved"
	if !mock && !live {
		return Config{}, fail("REAL_PROVIDER_NOT_QUALIFIED", 503)
	}
	token, mockToken := env["PAY_SERVICE_TOKEN"], env["PAY_MOCK_TOKEN"]
	secrets := len(token) >= 32 && mockToken == ""
	if !live {
		secrets = len(token) >= 32 && len(mockToken) >= 32 && token != mockToken
	}
	if !secrets {
		return Config{}, fail("INVALID_SERVICE_SECRETS", 400)
	}
	credentialFile := env["PAY_WECHAT_CREDENTIALS_FILE"]
	if live && !strings.HasPrefix(credentialFile, "/") {
		return Config{}, fail("WECHAT_CREDENTIALS_REQUIRED", 400)
	}
	var events *EventTarget
	if raw := env["PAY_EVENT_URL"]; raw != "" {
		target, err := url.Parse(raw)
		local := err == nil && target.Scheme == "http" && mode != "production" &&
			(target.Hostname() == "127.0.0.1" || target.Hostname() == "localhost")
		if err != nil || target.User != nil || target.Fragment != "" || !(target.Scheme == "https" || local) || target.Host == "" {
			return Config{}, fail("EVENT_URL_FORBIDDEN", 400)
		}
		eventToken := env["PAY_EVENT_TOKEN"]
		if len(eventToken) < 32 || eventToken == token || eventToken == mockToken {
			return Config{}, fail("INVALID_EVENT_SECRET", 400)
		}
		events = &EventTarget{URL: target.String(), Token: eventToken}
	}
	owner := get("PAY_CLIENT_ID", "kanyue")
	if !ownerPattern.MatchString(owner) {
		return Config{}, fail("INVALID_CLIENT_ID", 400)
	}
	interval, err := strconv.Atoi(get("PAY_WORKER_INTERVAL_MS", "2000"))
	if err != nil || interval < 100 || interval > 60000 {
		return Config{}, fail("INVALID_WORKER_INTERVAL", 400)
	}
	return Config{Mode: mode, Provider: provider, Live: live, CredentialFile: credentialFile, Events: events,
		Token: token, MockToken: mockToken, Owner: owner, Interval: time.Duration(interval) * time.Millisecond}, nil
}

// MockControls exposes /_test routes only in development and test mock modes.
func (c Config) MockControls() bool {
	return (c.Provider == "mock" || c.Provider == "wechatpay-mock") && (c.Mode == "development" || c.Mode == "test")
}
