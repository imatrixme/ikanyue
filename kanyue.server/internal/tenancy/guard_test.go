package tenancy_test

import (
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"testing"

	"kanyue.server/internal/tenancy"
)

// platform packages may reach PocketBase unscoped: they own the schema, seed
// fixtures, wire requests to tenants or run platform-level work.
var platform = map[string]bool{
	"migrations": true, "devseed": true, "testkit": true, "tenancy": true,
	"server": true, "gatewaylink": true, "console": true, "spike": true,
}

// unscopedApp lists where business code may hold the ServeEvent's unscoped app:
// only to register scheduled jobs, which run through tenancy.Job or tenancy.Each.
var unscopedApp = map[string]int{
	"coursecredit/booking_module.go":  1,
	"coursecredit/ledger_module.go":   1,
	"coursecredit/renewals_module.go": 1,
	"coursecredit/orders_module.go":   1,
	"plugins/payment/module.go":       1,
}

var (
	rawSQL    = regexp.MustCompile(`\.(DB|ConcurrentDB|NonconcurrentDB|AuxDB|AuxConcurrentDB|AuxNonconcurrentDB)\(\)|\.NewQuery\(`)
	rescope   = regexp.MustCompile(`tenancy\.Scope\(`)
	serveApp  = regexp.MustCompile(`\bse\.App\b`)
	cronJob   = regexp.MustCompile(`Cron\(\)\.(MustAdd|Add)\(`)
	tenantJob = regexp.MustCompile(`tenancy\.Job\(`)
)

// Business packages must stay inside the request or job tenant: no raw SQL, no
// picking a tenant themselves, no unscoped app outside job registration, and
// every scheduled job runs per tenant.
func TestBusinessCodeStaysInsideTheTenant(t *testing.T) {
	root := ".."
	err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, _ := filepath.Rel(root, path)
		if entry.IsDir() {
			if platform[rel] {
				return filepath.SkipDir
			}
			return nil
		}
		if !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		raw, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		source := string(raw)
		rel = filepath.ToSlash(rel)
		if rawSQL.MatchString(source) {
			t.Errorf("%s runs raw SQL; use the app's record queries so the tenant applies", rel)
		}
		if rescope.MatchString(source) {
			t.Errorf("%s picks a tenant itself; tenants come from the request or tenancy.Job", rel)
		}
		if got := len(serveApp.FindAllString(source, -1)); got != unscopedApp[rel] {
			t.Errorf("%s uses se.App %d times, allowed %d; handlers must use e.App", rel, got, unscopedApp[rel])
		}
		for _, line := range strings.Split(source, "\n") {
			if cronJob.MatchString(line) && !tenantJob.MatchString(line) {
				t.Errorf("%s registers a job without tenancy.Job: %s", rel, strings.TrimSpace(line))
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

// paymentOwned are the payment plugin's own collections; every other business
// collection belongs to the core.
var paymentOwned = []string{"payment_transactions", "refund_transactions", "payment_cases", "payment_claims", "payment_audit"}

// The payment plugin only moves money: it touches its own collections and
// reaches orders, refund requests and credit through the order center's
// commands. The core never depends on a plugin, so removing one cannot break it.
func TestPaymentPluginKeepsToMoney(t *testing.T) {
	quoted := map[string]*regexp.Regexp{}
	for _, name := range tenancy.Collections {
		if !slices.Contains(paymentOwned, name) {
			// A map key such as {"orders": ...} names a response field, not a collection.
			quoted[name] = regexp.MustCompile("[\x60\"]" + name + "[\x60\"]\\s*[^:\\s]")
		}
	}
	root := ".."
	err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return err
		}
		raw, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		source := string(raw)
		rel, _ := filepath.Rel(root, path)
		rel = filepath.ToSlash(rel)
		plugin := strings.HasPrefix(rel, "plugins/")
		if !plugin && strings.Contains(source, "\"kanyue.server/internal/plugins") {
			t.Errorf("%s imports a plugin; the core must not depend on plugins", rel)
		}
		if !strings.HasPrefix(rel, "plugins/payment/") {
			return nil
		}
		for name, pattern := range quoted {
			if pattern.MatchString(source) {
				t.Errorf("%s names core collection %s; go through the order center", rel, name)
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
