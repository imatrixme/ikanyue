package coursecredit

import (
	"slices"
	"testing"
	"time"
)

// Pure booking rules ported from Hono's courseBookingDomain tests.

const (
	domainStart = "2026-08-03T01:00:00.000Z"
	domainEnd   = "2026-08-03T02:00:00.000Z"
)

func slotStarts(t *testing.T, slots []any) []string {
	t.Helper()
	starts := []string{}
	for _, slot := range slots {
		starts = append(starts, slot.(map[string]any)["startAt"].(string))
	}
	return starts
}

func noLeadPolicy() map[string]any {
	policy := defaultBookingPolicy()
	policy["minLeadMinutes"] = 0.0
	return policy
}

// Hono: courseBookingDomain › default booking policy keeps morning and afternoon institution windows
func TestDefaultBookingPolicyWindows(t *testing.T) {
	policy, err := normalizeBookingPolicy(nil)
	if err != nil || fmtJSON(policy["defaultWindows"]) != `[{"endMinute":660,"startMinute":540},{"endMinute":1140,"startMinute":840}]` ||
		policy["timezone"] != "Asia/Shanghai" {
		t.Fatalf("policy = %v, %v", policy, err)
	}
	_, err = normalizeBookingPolicy(map[string]any{"slotStepMinutes": 20.0})
	failsWith(t, err, "BOOKING_SLOT_ALIGNMENT_INVALID")
	_, err = normalizeBookingPolicy(map[string]any{"claimGranularityMinutes": 30.0})
	failsWith(t, err, "BOOKING_CLAIM_GRANULARITY_IMMUTABLE")
	_, err = normalizeBookingPolicy(map[string]any{"timezone": "UTC"})
	failsWith(t, err, "BOOKING_TIMEZONE_UNSUPPORTED")
}

// Hono: courseBookingDomain › response deadline respects both ttl and the lesson cutoff
func TestResponseDeadlineTakesEarlierLimit(t *testing.T) {
	for requested, want := range map[string]string{
		"2026-08-01T00:00:00.000Z": "2026-08-02T00:00:00.000Z",
		"2026-08-02T19:00:00.000Z": "2026-08-02T20:00:00.000Z",
	} {
		got, err := responseDeadline(requested, "2026-08-03T02:00:00.000Z", defaultBookingPolicy())
		if err != nil || got != want {
			t.Fatalf("deadline(%s) = %s, %v", requested, got, err)
		}
	}
}

// Hono: courseBookingDomain › availability produces complete slots and removes overrides, claims, and ineligible starts
func TestSlotsSkipOverridesClaimsAndIneligibleStarts(t *testing.T) {
	now, _ := millis("2026-08-02T00:00:00.000Z")
	slots, err := generateAvailableSlots(slotQuery{
		policy: noLeadPolicy(), durationMinutes: 60.0, now: now,
		from: "2026-08-03T00:00:00.000Z", to: "2026-08-04T12:00:00.000Z",
		claims:    []map[string]any{{"status": "active", "cellStartAt": "2026-08-03T01:30:00.000Z", "cellEndAt": "2026-08-03T01:45:00.000Z"}},
		overrides: []map[string]any{{"status": "active", "type": "unavailable", "startAt": "2026-08-03T06:00:00.000Z", "endAt": "2026-08-03T07:00:00.000Z"}},
		eligible:  func(startAt string) (bool, error) { return startAt != "2026-08-03T10:00:00.000Z", nil },
	})
	if err != nil {
		t.Fatal(err)
	}
	starts := slotStarts(t, slots)
	if !slices.Contains(starts, "2026-08-03T02:00:00.000Z") {
		t.Fatalf("missing free slot: %v", starts)
	}
	for _, blocked := range []string{"2026-08-03T01:30:00.000Z", "2026-08-03T06:00:00.000Z", "2026-08-03T10:00:00.000Z"} {
		if slices.Contains(starts, blocked) {
			t.Fatalf("blocked slot %s offered", blocked)
		}
	}
}

// Hono: courseBookingDomain › custom availability is intersected with institution hours and merged
func TestCustomAvailabilityIntersectsAndMerges(t *testing.T) {
	got := intersections([]window{{540, 660}}, []window{{480, 600}, {590, 630}})
	if !slices.Equal(got, []window{{540, 630}}) {
		t.Fatalf("intersections = %v", got)
	}
	if merged := mergeWindows([]window{{600, 630}, {540, 600}}); !slices.Equal(merged, []window{{540, 630}}) {
		t.Fatalf("merged = %v", merged)
	}
}

// Hono: courseBookingDomain › availability helpers cover cross-day overrides, inactive records, and invalid ranges
func TestAvailabilityHelpersEdgeCases(t *testing.T) {
	policy := noLeadPolicy()
	override := map[string]any{"status": "active", "type": "available", "startAt": "2026-08-03T01:00:00.000Z", "endAt": "2026-08-05T02:00:00.000Z"}
	for date, want := range map[string][]window{
		"2026-08-02": nil,
		"2026-08-03": {{540, 1440}},
		"2026-08-04": {{0, 1440}},
		"2026-08-05": {{0, 600}},
	} {
		if got := overrideWindowsForDate(override, date); !slices.Equal(got, want) {
			t.Fatalf("override windows %s = %v", date, got)
		}
	}
	cancelled := copyWith(override, "status", "cancelled")
	windows := effectiveWindows("2026-08-03", 1, policy, slotQuery{availabilityMode: "custom",
		rules: []map[string]any{
			{"weekday": 1.0, "startMinute": 570.0, "endMinute": 630.0, "status": "active"},
			{"weekday": 1.0, "startMinute": 840.0, "endMinute": 900.0, "status": "inactive"},
			{"weekday": 2.0, "startMinute": 840.0, "endMinute": 900.0, "status": "active"},
		}, overrides: []map[string]any{cancelled}})
	if !slices.Equal(windows, []window{{570, 630}}) {
		t.Fatalf("effective = %v", windows)
	}
	if got := effectiveWindows("2026-08-03", 1, policy, slotQuery{availabilityMode: "custom"}); !slices.Equal(got, policyWindows(policy)) {
		t.Fatalf("custom without rules = %v", got)
	}
	if blockedByOverride(domainStart, domainEnd, []map[string]any{override}) {
		t.Fatal("an available override must not block")
	}
	if blockedByOverride(domainStart, domainEnd, []map[string]any{{"status": "cancelled", "type": "unavailable", "startAt": domainStart, "endAt": domainEnd}}) {
		t.Fatal("a cancelled override must not block")
	}
	if blockedByClaim(domainStart, domainEnd, []map[string]any{{"status": "released", "cellStartAt": domainStart, "cellEndAt": domainEnd}}) {
		t.Fatal("a released claim must not block")
	}
	now, _ := millis(domainStart)
	_, err := generateAvailableSlots(slotQuery{policy: policy, durationMinutes: 60.0, now: now, from: domainEnd, to: domainStart})
	failsWith(t, err, "BOOKING_RANGE_INVALID")
	_, err = generateAvailableSlots(slotQuery{policy: policy, durationMinutes: 50.0, now: now, from: domainStart, to: domainEnd})
	failsWith(t, err, "BOOKING_DURATION_INVALID")
}

// Hono: courseBookingDomain › schedule claims use deterministic time cells and detect active collisions
func TestScheduleClaimsCutAlignedCells(t *testing.T) {
	claims, err := scheduleClaim{ownerType: "teacher", ownerID: "teacher-1", sourceID: "lesson-1",
		startAt: domainStart, endAt: domainEnd, granularity: 15.0}.build()
	if err != nil || len(claims) != 4 || claims[0]["cellStartAt"] != domainStart || claims[3]["cellEndAt"] != domainEnd {
		t.Fatalf("claims = %v, %v", claims, err)
	}
	if !blockedByClaim(domainStart, domainEnd, []map[string]any{claims[2]}) {
		t.Fatal("an active cell must collide")
	}
	if blockedByClaim(domainStart, domainEnd, []map[string]any{copyWith(claims[2], "status", "released")}) {
		t.Fatal("a released cell must not collide")
	}
	rounded, err := scheduleClaim{ownerType: "teacher", ownerID: "teacher-1", sourceID: "lesson-1",
		startAt: "2026-08-03T01:05:00.000Z", endAt: domainEnd, granularity: 15.0}.build()
	if err != nil || rounded[0]["cellStartAt"] != domainStart {
		t.Fatalf("rounded = %v, %v", rounded, err)
	}
	// Go stores claims with a unique cell index, so collisions also fail in the database.
	f := bookingSetup(t, false)
	start := time.Now().UTC().Add(48 * time.Hour).Truncate(time.Hour)
	claim := func(source string) []step {
		plan, err := appointmentClaimPlan("", iso(start), iso(start.Add(time.Hour)), 15.0, source, f.teacherID, f.studentID)
		if err != nil {
			t.Fatal(err)
		}
		return plan
	}
	if err := send(f.app, claim("lesson-1")); err != nil {
		t.Fatal(err)
	}
	if err := send(f.app, claim("lesson-2")[2:3]); err == nil {
		t.Fatal("a second active claim on the same cell must fail")
	}
}

// Hono: courseBookingDomain › appointment state machine allows only declared transitions
func TestAppointmentStateMachine(t *testing.T) {
	if transitionAppointment("pending", "confirmed") != nil || transitionAppointment("confirmed", "rescheduled") != nil {
		t.Fatal("declared transitions must pass")
	}
	for _, terminal := range []string{"declined", "withdrawn", "expired", "cancelled", "fulfilled"} {
		for _, next := range []string{"confirmed", "cancelled", "fulfilled"} {
			failsWith(t, transitionAppointment(terminal, next), "APPOINTMENT_STATUS_TRANSITION_INVALID")
		}
	}
}
