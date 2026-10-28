// Package config reads the environment once; variable names are the ones the deploy env files already use.
package config

import (
	"os"
	"strings"
)

type Config struct {
	JWTSecret        string
	WechatAppID      string
	WechatSecret     string
	WechatSessionURL string
	// Renewal reminder subscribe message; validated by coursecredit.NewRenewalWechat.
	WechatRenewalTemplateID   string
	WechatRenewalTemplateData string
	WechatMiniprogramState    string
	WechatAPIURL              string
	DefaultAvatar             string
	PublicAssetBaseURL        string
	PBPublicURL               string
	OpsRegistrationEnabled    bool
	CourseCreditGrants        bool
	CourseCreditReservation   bool
	CourseCreditSettlement    bool
	CourseCreditMigration     bool
	// Commerce reads Hono's strict switch: only "true" enables online purchase.
	CourseCommerce  bool
	PayGatewayURL   string
	PayServiceToken string
	PayMockToken    string
	PayEventToken   string
	PayMockEnabled  bool
	// Outbox webhook; Hono's variable names, validated by coursecredit.NewNotificationDispatcher.
	OutboxWebhookURL       string
	OutboxWebhookSecret    string
	OutboxWebhookTimeoutMs string
	NodeEnv                string
}

func FromEnv() Config {
	return Config{
		JWTSecret:                 os.Getenv("JWT_SECRET"),
		WechatAppID:               os.Getenv("WECHAT_APPID"),
		WechatSecret:              os.Getenv("WECHAT_SECRET"),
		WechatSessionURL:          fallback(os.Getenv("WECHAT_JSCODE2SESSION"), "https://api.weixin.qq.com/sns/jscode2session"),
		WechatRenewalTemplateID:   os.Getenv("WECHAT_RENEWAL_TEMPLATE_ID"),
		WechatRenewalTemplateData: os.Getenv("WECHAT_RENEWAL_TEMPLATE_DATA"),
		WechatMiniprogramState:    os.Getenv("WECHAT_MINIPROGRAM_STATE"),
		WechatAPIURL:              fallback(os.Getenv("WECHAT_API_URL"), "https://api.weixin.qq.com"),
		DefaultAvatar:             os.Getenv("DEFAULT_AVATAR"),
		PublicAssetBaseURL:        os.Getenv("PUBLIC_ASSET_BASE_URL"),
		PBPublicURL:               fallback(os.Getenv("PB_PUBLIC_URL"), os.Getenv("PB_URL")),
		OpsRegistrationEnabled:    Truthy(os.Getenv("OPS_REGISTRATION_ENABLED")),
		CourseCreditGrants:        featureSwitch(os.Getenv("COURSE_CREDIT_GRANTS_ENABLED"), os.Getenv("NODE_ENV") != "production"),
		CourseCreditReservation:   featureSwitch(os.Getenv("COURSE_CREDIT_RESERVATION_ENABLED"), os.Getenv("NODE_ENV") != "production"),
		CourseCreditSettlement:    featureSwitch(os.Getenv("COURSE_CREDIT_SETTLEMENT_ENABLED"), os.Getenv("NODE_ENV") != "production"),
		CourseCreditMigration:     featureSwitch(os.Getenv("COURSE_CREDIT_MIGRATION_ENABLED"), os.Getenv("NODE_ENV") != "production"),
		CourseCommerce:            os.Getenv("COURSE_COMMERCE_ENABLED") == "true",
		PayGatewayURL:             os.Getenv("PAY_GATEWAY_URL"),
		PayServiceToken:           os.Getenv("PAY_SERVICE_TOKEN"),
		PayMockToken:              os.Getenv("PAY_MOCK_TOKEN"),
		PayEventToken:             os.Getenv("PAY_EVENT_TOKEN"),
		PayMockEnabled: (os.Getenv("NODE_ENV") == "development" || os.Getenv("NODE_ENV") == "test") &&
			os.Getenv("PAY_MOCK_ENABLED") == "true",
		OutboxWebhookURL:       os.Getenv("COURSE_CREDIT_OUTBOX_WEBHOOK_URL"),
		OutboxWebhookSecret:    os.Getenv("COURSE_CREDIT_OUTBOX_WEBHOOK_SECRET"),
		OutboxWebhookTimeoutMs: os.Getenv("COURSE_CREDIT_OUTBOX_WEBHOOK_TIMEOUT_MS"),
		NodeEnv:                os.Getenv("NODE_ENV"),
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

func fallback(value, other string) string {
	if value != "" {
		return value
	}
	return other
}
