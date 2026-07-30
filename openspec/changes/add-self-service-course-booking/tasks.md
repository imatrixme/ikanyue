## 1. Contract and Schema

- [x] 1.1 Add booking policy, teacher offering, availability, appointment, identity, event, claim, and conflict PocketBase collections with required indexes and rollback migration.
- [x] 1.2 Extend session and session-teacher schemas for appointment origin, cancellation metadata, and appointment assignment source.
- [x] 1.3 Add repository guards and schema tests for active claim uniqueness, relation constraints, UTC storage, and the no-PocketBase-hooks boundary.

## 2. Identity and Authorization

- [x] 2.1 Implement WeChat identity discovery, role-selection challenge, verified teacher binding, role switching, and backward-compatible student login.
- [x] 2.2 Persist and project teacher course capabilities into authenticated operator context without trusting client-provided claims.
- [x] 2.3 Add student ownership, teacher ownership, academic operator, Admin, and worker authorization tests for every booking route family.

## 3. Booking Domain and Transactions

- [x] 3.1 Implement versioned booking policy defaults and teacher recurring/override availability validation.
- [x] 3.2 Implement slot generation from policy, teacher rules, overrides, course duration, lead time, student validity, and active claims.
- [x] 3.3 Implement discrete schedule-claim planning for teachers and students and integrate claims into Admin lesson publication, reschedule, cancellation, and backfill conflict detection.
- [x] 3.4 Refactor lesson-hour reservation into reusable transaction plans while preserving existing command behavior and tests.
- [x] 3.5 Implement student request, duplicate prevention, list/detail, withdrawal, and cancellation commands with immutable appointment events.
- [x] 3.6 Implement teacher confirmation and decline, including atomic session materialization, FEFO reservation, time claims, conflicting-request closure, Outbox, versioning, and idempotency.
- [x] 3.7 Implement atomic confirmed-appointment cancellation and rescheduling with claim and lesson-hour release/reallocation.
- [x] 3.8 Implement appointment expiry worker, fulfillment projection, metrics, conflict records, and safe audit summaries.

## 4. Hono APIs and Documentation

- [x] 4.1 Add student booking-option, slot, appointment list/detail/create/withdraw/cancel APIs with student-safe projections.
- [x] 4.2 Add teacher dashboard, appointment decision, calendar, weekly availability, and date-override APIs with ownership guards.
- [x] 4.3 Add Admin booking list/detail, pending confirmation/decline, policy, offering, availability, cancellation, reschedule, conflict, and backfill APIs.
- [x] 4.4 Add OpenAPI definitions, stable error codes, request validation, pagination, idempotency headers, and endpoint contract tests.

## 5. Mini-Program Experience

- [x] 5.1 Implement role-aware identity state and custom TabBar while preserving the existing student tabs and visual system.
- [x] 5.2 Add student appointment creation, appointment list, detail, withdrawal, cancellation, refresh, pagination, and conflict recovery pages.
- [x] 5.3 Add teacher workbench, request confirmation/decline, teaching calendar, linked lesson detail, and availability editor pages.
- [x] 5.4 Extend shared course pages and API adapters for role-safe booking projections without exposing internal course-credit or claim terminology.
- [x] 5.5 Generate and optimize booking, calendar, confirmation, decline, and availability image assets consistent with the current design tokens.
- [x] 5.6 Add loading, empty, error, expired, slot-taken, eligibility-lost, disabled, and optimistic-action states across booking pages.

## 6. Admin Experience

- [x] 6.1 Add capability-scoped `/appointments` navigation, route, imagegen business icon, dashboard queue, and URL-stable workspace.
- [x] 6.2 Implement pending queue, list/calendar filters, appointment detail drawer, Admin confirmation/decline, linked lesson navigation, cancellation, and reschedule dialogs.
- [x] 6.3 Implement policy and teacher-offering management plus weekly availability and date-override workflows using human-readable scenes rather than relation-table CRUD.
- [x] 6.4 Implement booking conflict and migration queue with actionable context and safe operator resolution states.

## 7. Migration and Rollout

- [x] 7.1 Implement a dry-run future-session claim backfill report and deterministic conflict classification.
- [x] 7.2 Implement the idempotent backfill command and ensure affected offerings remain disabled until conflicts are resolved.
- [x] 7.3 Document data enablement, rollback, worker scheduling, notification prerequisites, and release-only Docker verification.

## 8. Verification and Completion

- [x] 8.1 Add focused Hono unit and repository-contract tests covering success, failure, rollback, race, expiry, cancellation, reschedule, authorization, projection, and idempotency.
- [x] 8.2 Add Taro unit, compiled-output, role-boundary, design-token, page-registration, refresh, pagination, and interaction tests.
- [x] 8.3 Add Admin unit, SSR, responsive workflow, capability, API-client, calendar, conflict, and Playwright tests.
- [x] 8.4 Run Hono, Taro, and Admin lint, build, unit, E2E, and coverage commands and prove all four coverage metrics are at least 95% independently.
- [ ] 8.5 Run final PocketBase Docker migration, rollback, restore, concurrent confirmation, backfill, and reconciliation verification only at the release gate.
- [x] 8.6 Run WeChat DevTools compile and visual checks plus desktop/mobile Admin screenshots, then record requirement-by-requirement implementation evidence.
