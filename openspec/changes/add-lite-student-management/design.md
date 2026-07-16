## Context

The hard-forked points-lite Admin currently exposes learner balances through `PointService.listStudentBalances`, but learner identity records can only be created or changed through older `/v1/student` routes that belong to the broader product. Those legacy handlers have a different response contract and are not an appropriate dependency for the isolated Admin console. The existing PocketBase `students` collection already owns the required records, and both points and login flows reference those record IDs.

The shared Admin form controls also rely on native input minimum widths. In a wide page with compact numeric grid tracks, those intrinsic widths can overflow their cells and visually overlap adjacent controls.

## Goals / Non-Goals

**Goals:**
- Give administrators one list-first student directory with responsive create/edit dialogs.
- Support search, status filtering, learner creation, profile editing, password reset, and enable/disable status through Admin-only ops APIs.
- Preserve existing student IDs and point-ledger relations.
- Make all shared inputs and selects shrink to their assigned grid tracks.
- Keep response contracts stable and covered in mock and real local environments.

**Non-Goals:**
- No classes, schedules, teacher assignment, reports, enrollment, attendance, hours, delivery, refunds, or academic administration.
- No mini-program student-management UI.
- No hard deletion or ledger cascade behavior.
- No new PocketBase collection, migration, dependency, or Docker validation loop.

## Decisions

### Add dedicated Admin-only ops routes

Create `GET /ops/students`, `POST /ops/students`, and `POST /ops/students/:id` in the existing ops route group. These routes use the same Admin JWT middleware as points and rewards and return the Admin client's `ListResult` and `StudentRecord` contracts.

The older `/v1/student` handlers were considered but rejected because they belong to the broader product, expose a different authorization/response model, and would reconnect the hard fork to functionality intentionally excluded from this release.

### Add a focused `StudentAdminService`

The service uses the existing ops repository, validates and normalizes fields, hashes non-empty passwords with the repository's established MD5 compatibility format, generates `sn` and `tokenKey` values for new records, and writes audit events. It returns only fields needed by the lightweight Admin.

Adding the methods to `PointService` was rejected because learner identity ownership and point-ledger ownership have different mutation rules.

### Disable rather than delete

The UI exposes an enabled/disabled control backed by `students.blocked`. Disabled learners remain visible in student management but are excluded from points operations. This preserves point-event foreign keys and historical auditability.

### One student source, separate projections

The student-management API returns identity/status fields. The points API continues returning balance-oriented rows and filters blocked learners. After create/edit/status mutation, the Admin refreshes the student directory and points rows independently so each projection stays correct.

### Keep list-first interaction architecture

Desktop uses a structured table and mobile uses cards. Create and edit occur in the existing `DialogShell`, including focus containment, Escape handling, full-screen mobile form behavior, unsaved-change protection, and affected-list refresh.

### Constrain shared controls at the component boundary

`Input` and `Select` receive `min-w-0 w-full`. Fixing only the current filter grid was rejected because the intrinsic-width defect applies to every compact responsive grid using those controls.

## Risks / Trade-offs

- [Legacy passwords use MD5 compatibility] -> Keep the existing login-compatible hash for this isolated change and do not introduce a second password format without a coordinated auth migration.
- [Disabled learners may still have active mini-program sessions] -> Existing auth/refresh flows already check `blocked`; the ops update changes the source field they consume.
- [Cellphone uniqueness races] -> Validate before create/update and rely on PocketBase constraints where available; surface repository conflict messages without closing the dialog.
- [Two learner projections can briefly diverge] -> Refresh both student management and points lists after successful identity/status changes.
- [No hard delete means stale records remain] -> Status filtering keeps daily operations clear while preserving ledger history.

## Migration Plan

1. Deploy the Hono ops service routes and tests against the existing `students` collection.
2. Deploy the Admin navigation, API adapter, list, and dialogs.
3. Run local schema/seed/smoke and live desktop/mobile E2E without Docker.
4. Roll back by removing the new navigation and routes; existing student records require no data rollback.

## Open Questions

- None for this lightweight release. Any future academic attributes require a separate capability and change.
