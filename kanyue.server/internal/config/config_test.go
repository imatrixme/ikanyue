package config

import "testing"

// Hono: courseCreditFeatureFlags › feature switches default on outside production and off in production
func TestFeatureSwitchDefaults(t *testing.T) {
	for _, name := range []string{"COURSE_CREDIT_GRANTS_ENABLED", "COURSE_CREDIT_RESERVATION_ENABLED", "COURSE_CREDIT_SETTLEMENT_ENABLED"} {
		t.Setenv(name, "")
	}
	t.Setenv("NODE_ENV", "test")
	if cfg := FromEnv(); !cfg.CourseCreditGrants || !cfg.CourseCreditReservation || !cfg.CourseCreditSettlement {
		t.Fatalf("test defaults = %+v", cfg)
	}
	t.Setenv("NODE_ENV", "production")
	if cfg := FromEnv(); cfg.CourseCreditGrants || cfg.CourseCreditReservation || cfg.CourseCreditSettlement {
		t.Fatalf("production defaults = %+v", cfg)
	}
	if !featureSwitch(" yes ", false) || featureSwitch("OFF", true) || !featureSwitch("", true) {
		t.Fatal("featureSwitch parsing")
	}
}
