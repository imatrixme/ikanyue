// Package config reads the gateway's environment once.
package config

import (
	"fmt"
	"net/netip"
	"strings"
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
}

const minTokenLength = 32

func Load(getenv func(string) string) (Config, error) {
	cfg := Config{
		Listen:            fallback(getenv("GATEWAY_LISTEN"), "127.0.0.1:1460"),
		RegistrationToken: getenv("GATEWAY_REGISTRATION_TOKEN"),
		AdminPublic:       getenv("GATEWAY_ADMIN_PUBLIC") == "1",
	}
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

func fallback(value, other string) string {
	if value != "" {
		return value
	}
	return other
}
