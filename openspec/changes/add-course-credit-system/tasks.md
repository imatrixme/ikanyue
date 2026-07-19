## 1. Product Rule Gates

- [ ] 1.1 Confirm the universal-credit denomination and whether universal batches expire.
- [ ] 1.2 Confirm default activation modes for rolling packages and fixed-term classes.
- [ ] 1.3 Confirm leave cutoff, late, no-show, institution cancellation, and teacher compensation rules.
- [ ] 1.4 Confirm allowed course-to-course conversion directions and reference-value loss limits.
- [ ] 1.5 Confirm first-release payment channels, guardian payment ownership, and offline-order approval.
- [ ] 1.6 Convert confirmed rule decisions into versioned fixtures shared by backend contract tests.

## 2. PocketBase Transaction Foundation

- [x] 2.1 Record the production PocketBase version and verify the JavaScript SDK Batch API availability and configuration.
- [x] 2.2 Add a minimal Hono-side SDK batch probe that proves multi-collection rollback on an injected failure.
- [x] 2.3 Define the version-controlled location for PocketBase migrations and Hono transaction repositories inside `ikanyue.mapi.hono`.
- [x] 2.4 Configure authenticated Hono SDK access and fail startup when the Batch API is not enabled.
- [x] 2.5 Deny public create, update, and delete access to all ledger and settlement collections.
- [x] 2.6 Add local backup and restore commands for the new PocketBase collections.
- [x] 2.7 Move all record, bootstrap, custom-route, scheduled, and transaction behavior out of PocketBase hooks; expose Hono worker routes and reject hook source or runtime configuration.

## 3. Catalog and Commerce Schema

- [x] 3.1 Add migrations for `course_specs` and `credit_types` with exact course-SKU constraints.
- [x] 3.2 Add migrations for `packages`, `package_grant_lines`, and immutable `price_versions`.
- [x] 3.3 Add migrations for `orders` and idempotent `payment_events`.
- [x] 3.4 Add indexes and uniqueness constraints for course codes, package codes, versions, and provider events.
- [x] 3.5 Add seed fixtures for universal credits, at least three incompatible course-credit types, and discounted packages.
- [x] 3.6 Add catalog validation tests for changed course specification versus price-only changes.

## 4. Ledger Schema and Invariants

- [x] 4.1 Add migrations for `credit_operations`, `credit_batches`, `credit_events`, and `credit_expiry_changes`.
- [x] 4.2 Enforce non-negative integer quantities and batch conservation in command validation.
- [x] 4.3 Add immutable-event guards that reject update and delete operations.
- [x] 4.4 Implement idempotency lookup and original-result replay by scoped `Idempotency-Key`.
- [x] 4.5 Implement FEFO batch querying with expiry, priority, and creation indexes.
- [x] 4.6 Add property tests proving quantity conservation across generated operation sequences.

## 5. Order Grant and Batch Lifecycle

- [x] 5.1 Implement transactional Hono `grantOrderCredits` for direct packages and universal recharge orders through the SDK Batch API.
- [x] 5.2 Persist list unit value, paid unit cost, currency, grant snapshot, activation, and expiry policy per batch.
- [x] 5.3 Implement `GRANT_TIME`, `FIRST_RESERVATION`, `FIRST_CHECK_IN`, `FIRST_COMPLETED_SESSION`, and `TERM_START` activation transitions.
- [x] 5.4 Implement activation deadlines and prevention of new use after missed activation.
- [x] 5.5 Implement batch expiry using service-time validity and protected valid reservations.
- [x] 5.6 Implement audited expiry extension and compensation batches for restored expired quantity.
- [x] 5.7 Add duplicate payment, cancelled order, activation race, and delayed settlement tests.

## 6. Conversion Engine

- [x] 6.1 Add migrations for immutable `conversion_rules` and `conversion_allocations`.
- [x] 6.2 Implement integer ratio, minimum step, effective period, direction, and status validation.
- [x] 6.3 Implement `INHERIT_SOURCE`, `RESET_ON_CONVERSION`, `RESET_ON_ACTIVATION`, `MIN_SOURCE_AND_NEW`, and `TARGET_TERM_END` expiry policies.
- [x] 6.4 Preserve source-batch allocation and split target output when expiry or cost outcomes differ.
- [x] 6.5 Implement transactional explicit conversion with immutable `CONVERT_OUT` and `CONVERT_IN` events.
- [x] 6.6 Implement conversion preview that returns authoritative quantities, expiry, activation, and reversibility.
- [x] 6.7 Implement directed-graph cycle and reference-value growth validation before rule publication.
- [x] 6.8 Implement scoped automatic-conversion authorization and invalidation when material rule terms change.
- [x] 6.9 Add conversion tests for inactive rules, fractional requests, multi-batch sources, profitable cycles, and rollback.

## 7. Teaching Organization Schema

- [x] 7.1 Add migrations for `classes`, `class_students`, and `class_teachers` with effective dates.
- [x] 7.2 Add migrations for `sessions`, `session_classes`, `session_students`, and `session_teachers`.
- [x] 7.3 Add migrations for `session_credit_allocations` and unique session-student constraints.
- [x] 7.4 Implement class membership commands that never mutate course-credit balances.
- [x] 7.5 Implement session publication with credit, attendance, cancellation, and teacher-rule snapshots.
- [x] 7.6 Implement deduplicated roster materialization from one or more linked classes.
- [x] 7.7 Implement class teacher inheritance and explicit actual-session teacher overrides.
- [x] 7.8 Add tests for transfers, combined classes, duplicate students, substitute teachers, and historical snapshots.

## 8. Reservation and Lesson Settlement

- [x] 8.1 Implement pre-class eligibility evaluation for exact credit type and session start validity.
- [x] 8.2 Implement idempotent FEFO reservation that moves batch quantity from available to frozen through the SDK Batch API.
- [x] 8.3 Implement authorized implicit conversion plus target reservation in one transaction.
- [x] 8.4 Store attendance state separately from credit reservation and settlement state.
- [x] 8.5 Implement rule-based consume or release behavior for present, late, leave, absent, and cancelled states.
- [x] 8.6 Implement reschedule revalidation and immediate expiry when an already-expired allocation is released.
- [x] 8.7 Implement transactional `settleSession` across student allocations, teacher pending credits, session state, audit, and outbox.
- [x] 8.8 Implement settlement reversal and re-settlement without mutating original events.
- [x] 8.9 Add concurrency tests for two simultaneous reservations against the same final credit.
- [x] 8.10 Add duplicate settlement, teacher-write failure rollback, cancellation, reschedule, and correction tests.

## 9. Teacher Session Credits

- [x] 9.1 Add migrations for immutable `teacher_credit_rules` and `teacher_credit_events`.
- [x] 9.2 Implement role, course specification, duration, and participant-based pending earning calculation.
- [x] 9.3 Implement authorized pending-to-confirmed transition.
- [x] 9.4 Implement institution-cancellation compensation as an explicit versioned rule.
- [x] 9.5 Implement teacher earning reversal linked to the original event and corrected re-settlement.
- [x] 9.6 Add tests for lead/assistant, substitute, cancelled session, and non-conservation with student credits.

## 10. Outbox, Reconciliation, and Audit

- [x] 10.1 Add migrations for `outbox_events` and `reconciliation_runs`.
- [x] 10.2 Implement post-commit notification delivery with retry and dead-letter visibility.
- [x] 10.3 Implement incremental and full batch reconstruction from events and allocations.
- [x] 10.4 Add reconciliation exception records without silently rewriting snapshots.
- [x] 10.5 Extend audit metadata with operation id, trace id, reason, outcome, and privacy-safe before/after summaries.
- [x] 10.6 Add metrics for command success, conflicts, insufficient credit, settlement failure, expiry, outbox lag, and reconciliation drift.

## 11. Hono API Contracts

- [x] 11.1 Add student summary, batch, event, conversion-rule, preview, conversion, and session query routes.
- [x] 11.2 Add student reservation command with identity derived only from authenticated context.
- [x] 11.3 Add Admin catalog, package, pricing, order, credit, conversion, class, session, settlement, teacher-credit, and reconciliation routes.
- [x] 11.4 Add explicit high-risk action routes for extension, reversal, settlement, and reopening.
- [x] 11.5 Add stable business error codes and operation/trace identifiers to command responses.
- [x] 11.6 Add RBAC capabilities for academic, finance, settlement, audit, teacher, student, and guardian scopes.
- [x] 11.7 Generate and verify Swagger/OpenAPI contracts for every new route.

## 12. Admin Workspaces

- [ ] 12.1 Add course specification, package, grant-line, and price-version management views.
- [ ] 12.2 Add student credit-account table and batch/event detail drawer.
- [ ] 12.3 Add conversion-rule editor with graph validation, preview examples, publication, and deactivation.
- [ ] 12.4 Add class workspace for students, teachers, course specification, term, and status.
- [ ] 12.5 Add session workspace for linked classes, deduplicated roster, actual teachers, eligibility, and attendance.
- [ ] 12.6 Add settlement exception workspace for insufficient, expired release, duplicate, failed, and correction states.
- [ ] 12.7 Add teacher-credit pending and confirmed workspaces.
- [ ] 12.8 Add high-risk review dialogs that display affected batches, quantities, expiry, sessions, and reasons.
- [ ] 12.9 Add wide and narrow viewport tests without page-internal focus-confusing view replacement.

## 13. Mini Program Experience

- [ ] 13.1 Add course-credit summary grouped by universal and exact course type.
- [ ] 13.2 Add batch detail with source, activation deadline, effective expiry, frozen quantity, and restrictions.
- [ ] 13.3 Add paginated credit-event history linked to orders, conversions, and lesson sessions.
- [ ] 13.4 Add explicit conversion preview and confirmation flow.
- [ ] 13.5 Add lesson eligibility states for reserved, conversion required, insufficient, and settled.
- [ ] 13.6 Add current-consent flow for implicit conversion during reservation.
- [ ] 13.7 Add pull-to-refresh, pagination, loading, empty, expired, and network-error states.
- [ ] 13.8 Verify critical flows in WeChat DevTools and add compiled-output contracts.

## 14. Public Website Projection

- [ ] 14.1 Add a public API projection for published course specifications, packages, prices, and validity summaries.
- [ ] 14.2 Add website course and package pages using the shared design tokens without private account data.
- [ ] 14.3 Add purchase or mini-program handoff links without executing ledger commands in the website client.
- [ ] 14.4 Add tests proving private balance, roster, order, and teacher-credit fields are never rendered publicly.

## 15. Historical Data Migration

- [ ] 15.1 Inventory production `students.hours`, `teachers.hours`, legacy learning collections, lessons, and attendance records.
- [ ] 15.2 Build an Admin-assisted mapping workflow for legacy student hours to explicit migration batches.
- [ ] 15.3 Build an Admin-assisted classification workflow that splits legacy learning programs into packages or classes.
- [ ] 15.4 Import historical sessions and attendance without automatically charging course credits.
- [ ] 15.5 Migrate teacher hours only as explicit teacher-credit adjustment events.
- [ ] 15.6 Produce before/after migration reports and require zero unexplained quantity differences.

## 16. Shadow Rollout and Release

- [ ] 16.1 Run shadow eligibility and settlement against representative real classes without mutating balances.
- [ ] 16.2 Compare shadow results with academic-operations expectations and resolve every discrepancy.
- [ ] 16.3 Enable direct package grants behind a feature flag and monitor reconciliation.
- [ ] 16.4 Enable reservation and settlement behind separate feature flags.
- [ ] 16.5 Enable explicit conversion, then authorized implicit conversion, after earlier stages are stable.
- [ ] 16.6 Configure independent lines, branches, functions, and statements thresholds of at least 95% in every affected project.
- [ ] 16.7 Before release, rehearse PocketBase migration and rollback on a production-like backup.
- [x] 16.8 Add explicit tests for validation failure, authorization failure, duplicate command, rollback, concurrent reservation, expiry boundary, reversal, and reconciliation drift.
- [ ] 16.9 Run focused local tests, coverage, and runtime verification throughout implementation without Docker.
- [ ] 16.10 At the final release gate, confirm all four coverage metrics are at least 95% in each affected project, then run Docker build/deployment validation, reconciliation, and rollback smoke tests.
