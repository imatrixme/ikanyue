// Package config reads the gateway's environment once.
package config

import (
	"fmt"
	"net/netip"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	// Listen is the data plane address (GATEWAY_LISTEN); the admin plane is PocketBase's --http.
	Listen string
	// Trusted are the hops whose X-Forwarded-* headers are believed (GATEWAY_TRUSTED_PROXIES).
	Trusted []netip.Prefix
	// RegistrationToken authenticates service heartbeats (GATEWAY_REGISTRATION_TOKEN); empty disables registration.
	RegistrationToken string
	// AdminPublic allows binding the admin plane to a public address (GATEWAY_ADMIN_PUBLIC=1), e.g. inside a container.
	AdminPublic bool
	// ReleaseApproval makes a release to RELEASE wait for a second identity's approval (GATEWAY_RELEASE_APPROVAL=1).
	ReleaseApproval bool
	// Request logs: GATEWAY_LOG_SAMPLE (share of fast successes kept, default 0.1), GATEWAY_LOG_SLOW_MS
	// (always kept above, default 1000), GATEWAY_LOG_TRUNCATE_IP=1, GATEWAY_LOG_RETENTION_DAYS (7)
	// and GATEWAY_METRIC_RETENTION_DAYS (90).
	LogSample       float64
	LogSlow         time.Duration
	LogTruncateIP   bool
	LogRetention    time.Duration
	MetricRetention time.Duration
}

const minTokenLength = 32

func Load(getenv func(string) string) (Config, error) {
	cfg := Config{
		Listen:            fallback(getenv("GATEWAY_LISTEN"), "127.0.0.1:1460"),
		RegistrationToken: getenv("GATEWAY_REGISTRATION_TOKEN"),
		AdminPublic:       getenv("GATEWAY_ADMIN_PUBLIC") == "1",
		ReleaseApproval:   getenv("GATEWAY_RELEASE_APPROVAL") == "1",
	}
	var err error
	if cfg.LogSample, err = number(getenv, "GATEWAY_LOG_SAMPLE", 0.1, 0, 1); err != nil {
		return cfg, err
	}
	slow, err := number(getenv, "GATEWAY_LOG_SLOW_MS", 1000, 1, 600000)
	if err != nil {
		return cfg, err
	}
	logDays, err := number(getenv, "GATEWAY_LOG_RETENTION_DAYS", 7, 1, 365)
	if err != nil {
		return cfg, err
	}
	metricDays, err := number(getenv, "GATEWAY_METRIC_RETENTION_DAYS", 90, 1, 3650)
	if err != nil {
		return cfg, err
	}
	day := 24 * time.Hour
	cfg.LogSlow, cfg.LogRetention, cfg.MetricRetention = time.Duration(slow)*time.Millisecond, time.Duration(logDays)*day, time.Duration(metricDays)*day
	cfg.LogTruncateIP = getenv("GATEWAY_LOG_TRUNCATE_IP") == "1"
	if cfg.RegistrationToken != "" && len(cfg.RegistrationToken) < minTokenLength {
		return cfg, fmt.Errorf("GATEWAY_REGISTRATION_TOKEN must be at least %d characters", minTokenLength)
	}
	for _, entry := range strings.Split(fallback(getenv("GATEWAY_TRUSTED_PROXIES"), "127.0.0.1,::1"), ",") {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}
		prefix, err := netip.ParsePrefix(entry)
		if err != nil {
			addr, addrErr := netip.ParseAddr(entry)
			if addrErr != nil {
				return cfg, fmt.Errorf("GATEWAY_TRUSTED_PROXIES: invalid entry %q", entry)
			}
			prefix = netip.PrefixFrom(addr, addr.BitLen())
		}
		cfg.Trusted = append(cfg.Trusted, prefix.Masked())
	}
	return cfg, nil
}

// number reads an optional numeric variable within [low, high].
func number(getenv func(string) string, name string, fallback, low, high float64) (float64, error) {
	raw := strings.TrimSpace(getenv(name))
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.ParseFloat(raw, 64)
	if err != nil || value < low || value > high {
		return 0, fmt.Errorf("%s must be a number from %g to %g", name, low, high)
	}
	return value, nil
}

func fallback(value, other string) string {
	if value != "" {
		return value
	}
	return other
}
