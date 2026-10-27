// Package config reads the environment once; names match Hono's so both run from the same env file.
package config

import (
	"os"
	"strings"
)

type Config struct {
	JWTSecret              string
	HonoURL                string
	HonoModules            []string
	WechatAppID            string
	WechatSecret           string
	WechatSessionURL       string
	DefaultAvatar          string
	PublicAssetBaseURL     string
	PBPublicURL            string
	OpsRegistrationEnabled bool
	CourseCreditGrants     bool
}

func FromEnv() Config {
	return Config{
		JWTSecret:              os.Getenv("JWT_SECRET"),
		HonoURL:                os.Getenv("HONO_UPSTREAM_URL"),
		HonoModules:            list(os.Getenv("KANYUE_HONO_MODULES")),
		WechatAppID:            os.Getenv("WECHAT_APPID"),
		WechatSecret:           os.Getenv("WECHAT_SECRET"),
		WechatSessionURL:       fallback(os.Getenv("WECHAT_JSCODE2SESSION"), "https://api.weixin.qq.com/sns/jscode2session"),
		DefaultAvatar:          os.Getenv("DEFAULT_AVATAR"),
		PublicAssetBaseURL:     os.Getenv("PUBLIC_ASSET_BASE_URL"),
		PBPublicURL:            fallback(os.Getenv("PB_PUBLIC_URL"), os.Getenv("PB_URL")),
		OpsRegistrationEnabled: Truthy(os.Getenv("OPS_REGISTRATION_ENABLED")),
		CourseCreditGrants:     featureSwitch(os.Getenv("COURSE_CREDIT_GRANTS_ENABLED"), os.Getenv("NODE_ENV") != "production"),
	}
}

// Truthy matches Hono's normalizeBoolean for string inputs.
func Truthy(value string) bool {
	return value == "true" || value == "1"
}

// featureSwitch is Hono's readFeatureSwitch: blank falls back to the default.
func featureSwitch(value string, defaultEnabled bool) bool {
	value = strings.TrimSpace(value)
	if value == "" {
		return defaultEnabled
	}
	switch strings.ToLower(value) {
	case "1", "true", "yes", "on":
		return true
	}
	return false
}

func list(value string) []string {
	items := []string{}
	for _, item := range strings.Split(value, ",") {
		if item = strings.TrimSpace(item); item != "" {
			items = append(items, item)
		}
	}
	return items
}

func fallback(value, other string) string {
	if value != "" {
		return value
	}
	return other
}
