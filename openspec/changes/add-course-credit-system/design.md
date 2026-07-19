## Context

The `release/2.0.0` baseline contains four active product surfaces: `ikanyue.admin`, `ikanyue.mapi.hono`, `ikanyue.taro3`, and `ikanyue.website`. Historical implementations used `students.hours` / `teachers.hours`, standalone lesson and attendance records, and generic learning-program relations. The current lite branch added an immutable-event idea for physical reward points, but its balance update and event creation are separate PocketBase REST writes.

Course credits have materially stronger requirements: a universal credit cannot be consumed; a course-specific credit can only consume its exact course SKU; every grant and conversion forms batches with activation and expiry rules; a lesson may combine multiple classes and teachers; reservation, conversion, consumption, teacher earning, and outbox records must commit atomically.

The complete product rules are defined in `docs/product/course-credit-system-prd.md`; the detailed architecture and data dictionary are defined in `docs/architecture/course-credit-system-technical-design.md`.

Stakeholders include students/guardians, teachers, academic operations, finance/operations, administrators, and support staff. PocketBase remains the persistence platform, Hono remains the public API and authorization boundary, Admin remains the operator client, the mini program remains the private student client, and the website remains public-only.

## Goals / Non-Goals

**Goals:**

- Create a typed, batched, auditable course-credit ledger separate from physical reward points.
- Support direct package grants, universal credits, directed conversion, first-use activation, expiry, extension, reservation, settlement, reversal, and reconciliation.
- Separate products/packages from classes and concrete lesson sessions.
- Support many students, many classes, and many teachers without duplicate consumption or teacher earning.
- Put all high-risk mutations behind an idempotent database transaction boundary.
- Define clear responsibilities and APIs for all four active product repositories.
- Preserve a staged rollout and a reversible cutover from historical data.
- Enforce at least 95% line, branch, function, and statement coverage independently in every affected project.

**Non-Goals:**

- No student-to-student transfers or open exchange market.
- No reuse of `student_points`, `point_events`, `students.hours`, or `teachers.hours` as the new source of truth.
- No public website access to private account, class, or settlement data.
- No online cash-refund workflow in the initial implementation.
- No full restoration of every legacy academic-management feature in the first delivery.
- No Docker verification during normal implementation; Docker is reserved for the final release gate.

## Decisions

### Execute ledger commands in Hono through the PocketBase SDK Batch API

Hono owns grant, conversion, reservation, activation, settlement, expiry, and reversal logic. Its repositories use the existing authenticated PocketBase JavaScript SDK client. Multi-record writes are queued with `pb.createBatch()` and sent through the PocketBase Batch API so the storage service commits all create, update, upsert, and delete requests in one read/write transaction.

PocketBase remains a storage service: it owns collections, indexes, files, access rules, and transactional batch persistence, but no backend business hooks. Record lifecycle hooks, custom PocketBase routes, scheduled hooks, and hook-side transactions are forbidden. Record rules run in Hono domain services, startup capability checks replace bootstrap hooks, explicit Hono routes replace custom serve hooks, and external scheduling invokes Hono expiry, Outbox, and reconciliation worker routes instead of PocketBase cron hooks. A repository guard rejects hook directories, hook files, hook APIs, and runtime hook configuration. Sequential SDK writes and Hono-side compensation were rejected because they cannot prevent partial ledger writes. Direct Hono access to PocketBase SQLite was also rejected because it would couple the API runtime to PocketBase's private storage layout. A separate PostgreSQL service remains a fallback only if the production write profile cannot be supported by the configured Batch API.

### Keep immutable events plus transactional batch projections

`credit_events` and `credit_operations` are append-only audit facts. `credit_batches` stores transactional quantity buckets for efficient eligibility checks. Reconciliation rebuilds expected batch quantities from events and allocations; it reports drift rather than silently rewriting history.

An event-only read path was rejected because classroom reservation needs fast, indexed, concurrent availability checks. A mutable balance-only design was rejected because it cannot explain source, price, expiry, or corrections.

### Model credit type as an exact consumable course SKU

A course-specific credit type binds to one `course_spec` such as delivery mode, duration, and teacher tier. A lesson session snapshots exactly one required credit type and currently requires one integer unit. Price changes create new price versions and batches, not new credit types, unless the delivered lesson specification changes.

This prevents unrelated courses from sharing a balance while preserving the rule that one valid point buys one lesson of its own type.

### Keep universal credits non-consumable

Universal credits are exchange value only. A session reservation must first create a complete explicit or authorized implicit conversion operation and then reserve the newly created course-specific batch in the same transaction. There is no direct fallback debit from universal credits.

### Version package, conversion, attendance, and teacher rules

Versioned price, conversion, and teacher-rule records are create-only. Draft changes, publication, and deactivation produce a new version instead of updating an existing record. Orders snapshot price and grant lines; conversions snapshot ratio and expiry behavior; sessions snapshot credit, attendance, cancellation, and teacher rules. New versions affect only future operations.

This prevents current configuration from changing historical value or settlement outcomes.

### Treat conversion as a directed graph

Conversion rules have integer source/target quantities, effective dates, direction, reference-value bounds, activation behavior, and expiry behavior. Publication runs a graph simulation that rejects any reachable cycle capable of increasing reference value. Reverse conversion is not implied.

### Preserve source batches through conversion

Conversion allocations connect each source batch to target batches. Sources with different expiry or cost basis are not blindly merged. Target expiry uses one of `INHERIT_SOURCE`, `RESET_ON_CONVERSION`, `RESET_ON_ACTIVATION`, `MIN_SOURCE_AND_NEW`, or `TARGET_TERM_END`.

This supports both business choices requested by the user: retaining the source expiry or deliberately resetting validity after conversion.

### Make activation an explicit event

Products select `GRANT_TIME`, `FIRST_RESERVATION`, `FIRST_CHECK_IN`, `FIRST_COMPLETED_SESSION`, or `TERM_START`; the vague term “first use” is not stored. Rolling packages default to `FIRST_CHECK_IN` pending final product confirmation, while fixed-term classes use `TERM_START`.

Unactivated batches have an activation deadline. Reservations may provisionally use them only when the session is eligible. Cancellation of the candidate session does not activate a `FIRST_CHECK_IN` batch.

### Separate classes, sessions, and rosters

Classes contain long-lived student and teacher memberships. Sessions are concrete teaching events and may link to several classes. Publishing or closing enrollment materializes one deduplicated `session_student` per student and explicit `session_teacher` rows for actual assignments.

Settlement never derives attendance from the current class roster, because membership can change after scheduling.

### Separate attendance state from credit state

`session_students` stores both attendance status and credit status. A student can be checked in while settlement is pending, or absent while a cancellation rule still determines whether credit is consumed. A single overloaded status would hide these differences.

### Reserve before class and settle after completion

Eligibility checks and FEFO allocation occur before the class cutoff. Insufficient credit is surfaced before class start. Completed sessions consume or release reservations according to the snapshot rule. Settled sessions are corrected only through reversal and re-settlement.

### Keep teacher session credits independent

Teacher credit events use their own rule versions and ledger. Actual session teachers, roles, duration, and optional participant factors determine earnings. Student consumption and teacher earnings do not have to balance numerically.

### Use an outbox for side effects

Transactions write notification and analytics intents to `outbox_events`. External HTTP calls happen after commit and can retry without replaying ledger mutations.

### Stage migration and cutover

Legacy `hours` values are not auto-converted because they lack course type, source, and expiry. Admins must map them into explicit migration batches. Legacy learning programs are manually classified as packages or classes. Historical sessions can be imported without automatically charging students.

The rollout sequence is schema and transaction foundation, direct package grants, class/session settlement, universal conversion, then automation and reporting. Shadow calculations and reconciliation precede each write cutover.

## Risks / Trade-offs

- [PocketBase Batch API is disabled] -> Add a startup storage-capability check and refuse to enable course-credit writes until it is enabled.
- [SQLite single-writer contention during bulk settlement] -> Keep transactions short, index batch selection, settle per session, and serialize hot student accounts.
- [Rules become difficult for operators to understand] -> Provide preview, sample outcomes, graph validation, immutable publication, and explicit effective dates.
- [First-check-in activation conflicts with advance reservations] -> Track provisional reservations, activation deadlines, and revalidate future reservations at activation.
- [Historical hours cannot be mapped safely] -> Require manual course type, expiry, and source decisions; never guess from names or totals.
- [Event and batch projection drift] -> Run incremental and daily reconciliation and repair only through audited adjustment operations.
- [High nominal coverage misses risky branches] -> Enforce all four coverage metrics independently at 95% and require explicit success, failure, rollback, concurrency, and idempotency tests for the transaction kernel.
- [Implicit conversion surprises students] -> Require a current user confirmation or scoped automatic-conversion authorization that is invalidated when material rule terms change.
- [A settled lesson is edited directly] -> Deny direct mutation and require reversal, correction, and re-settlement.

## Migration Plan

1. Freeze `release/2.0.0` and prohibit new writes to legacy course-hour fields.
2. Verify production PocketBase version, SDK Batch API availability/configuration, transaction behavior, backup, and restore.
3. Add new catalog, ledger, conversion, teaching, teacher-credit, outbox, and reconciliation collections with indexes and deny-by-default rules.
4. Implement and test idempotent Hono services and PocketBase SDK batch repositories.
5. Add read-only Admin and mini-program projections, then import manually approved migration batches.
6. Run shadow eligibility and settlement against real class samples without changing balances.
7. Enable direct package grants, then reservation/settlement, then explicit conversion, then authorized implicit conversion.
8. Run local full validation throughout development; perform migration rehearsal and Docker deployment validation only at the final release gate.
9. Roll back by disabling Hono command routes and rule publication while preserving all new records; never write new ledger state back into legacy `hours`.

## Open Questions

- Is one universal credit exactly one yuan of reference exchange value, or another fixed denomination?
- Does a universal-credit batch itself expire?
- Is the rolling-package default activation event `FIRST_CHECK_IN` or `FIRST_COMPLETED_SESSION`?
- What are the exact leave cutoff, late, no-show, institution cancellation, and teacher compensation rules?
- Which course-to-course conversion directions are allowed, and what reference-value loss is acceptable?
- Which payment channels and guardian-payment relationships are included in the first release?
