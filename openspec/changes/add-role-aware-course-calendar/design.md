## Context

Formal lessons already live in `sessions` and are related to teachers, learners, and classes through `session_teachers`, `session_students`, and `session_classes`. Appointment requests are workflow records that create a session only after teacher confirmation. The current teacher calendar incorrectly queries appointment requests, the learner overview returns only one upcoming lesson, and the Admin booking workspace has only a grouped appointment agenda rather than an institution timetable.

The change spans Hono, the React Admin, and the Taro mini program. PocketBase remains storage only; all authorization, projection, and workflow behavior stays in Hono through the PocketBase JavaScript SDK. The parent repository remains dependency-neutral, course-credit terminology remains internal, and release-level Docker verification is deferred to the final release gate.

## Goals / Non-Goals

**Goals:**

- Make `sessions` the only formal schedule source for institution, teacher, and learner calendar projections.
- Give Admin a full-width day/week/month/list timetable with stable filters and existing lesson actions.
- Give teachers every assigned formal lesson, including class, appointment, and Admin-created lessons, with an optional availability overlay.
- Give learners and both role home surfaces the next three formal lessons without exposing internal entitlement data.
- Preserve authorization, optimistic versioning, conflict detection, responsive design, and at least 95% coverage in affected scopes.

**Non-Goals:**

- No learner self-enrollment, attendance scanning, room-resource domain, push notification delivery, or calendar export.
- No direct browser or mini-program access to PocketBase.
- No drag-and-drop lesson mutation in the first release.
- No Website, Flutter, mobile Nuxt, or production deployment changes.

## Decisions

### 1. Formal schedule truth is `sessions`

Calendar entries are projected from sessions and their relation rows. Appointment requests are shown only in the existing pending-work queue until confirmation creates a session. Schedule claims remain collision-control data and are never treated as display events.

Alternative: merge appointments, claims, and sessions into a new calendar collection. Rejected because it creates synchronization and repair obligations around a derived read model.

### 2. Add one role-aware query service

Create `src/services/courseCredits/schedule/` with range validation, relation loading, role scoping, projections, and availability expansion. It returns a stable internal entry model and role-specific public DTOs. Queries batch related rows by session ids and must not perform one request per lesson.

The calendar range uses half-open UTC intervals `[from, to)`, displays in `Asia/Shanghai`, and is limited to 42 days. Home queries are independently limited to three upcoming entries.

### 3. Extend APIs without breaking existing clients

- `GET /ops/course-calendar` returns institution entries and filter facets.
- `GET /v1/teacher/schedule` returns the authenticated teacher's formal lessons and optional availability windows.
- `GET /v1/schedule/upcoming` returns up to three entries scoped from the authenticated JWT role.
- `/v1/student/learning/lessons` gains teacher and class labels.
- The learning overview gains `upcomingLessons` while retaining `nextLesson`.
- `/v1/teacher/calendar` remains as a compatibility alias during this change.

### 4. Calendar reads never mutate lessons

Admin detail actions call the existing session detail, reschedule, and cancellation commands and include the current version. The calendar refreshes after success or a stable version/conflict error. No calendar endpoint writes PocketBase records.

### 5. Add query indexes, not a new collection

Add calendar lookup indexes for sessions and relation tables. Keep `location` as text in this release. A room domain can later use the existing `room` claim owner type without changing the formal lesson source.

### 6. Use project-owned calendar rendering

Admin uses tested date/range and interval-lane helpers plus CSS Grid so the timetable matches the existing design tokens without adding a second visual system or premium resource-calendar dependency. P0 supports day, week, month, and list views; event movement remains dialog-driven.

Teacher mobile UI uses a horizontal seven-day strip and a daily agenda instead of compressing seven timetable columns onto a phone. Availability is a toggleable pale background layer; formal lessons remain the primary foreground items.

### 7. Home surfaces use a lightweight shared projection

The activity home requests only the next three lessons. The module hides for unauthenticated users and empty results and does not replace activity loading or errors. Teacher rows show learner/class context; learner rows show teacher context. The existing course/workbench pages use the same projection contract.

### 8. Privacy and authorization are server owned

Admin requires academic operations capability. Teacher queries are constrained by `session_teachers.teacherId`; learner queries are constrained by `session_students.studentId`. Learner and teacher DTOs omit course-credit ids, quantities, frozen balances, claims, phone numbers, and unrelated participants.

## Risks / Trade-offs

- [Large date ranges could create expensive relation queries] -> enforce a 42-day maximum, cap returned entries, batch relation lookups, and add calendar indexes.
- [Custom calendar layout can mishandle overlapping lessons] -> isolate interval-lane placement in pure tested helpers and fall back to stacked list rendering on narrow widths.
- [Old teacher calendar consumers expect appointment ids] -> retain nullable appointment linkage and keep the old endpoint as a compatibility adapter.
- [Home data can become stale after role switching] -> key caches by principal role/id, refresh on `onShow`, and clear role-scoped state during role changes.
- [Availability windows may visually compete with lessons] -> hide them by default and render them as non-interactive background ranges.
- [Existing course-credit schema changes are still unreleased] -> generate an additive migration and perform migration/rollback/restore only at the final release gate.

## Migration Plan

1. Add schema index definitions and generate an additive PocketBase migration with a reversible down path.
2. Deploy Hono schedule APIs and compatibility behavior before exposing new clients.
3. Deploy Admin institution timetable and retain the existing booking queue.
4. Deploy mini-program upcoming and teacher calendar surfaces with existing endpoints as fallback during rollout.
5. At the final release gate, run the PocketBase Docker migration, rollback, restore, concurrent reschedule/cancellation, and query-plan verification once.
6. Roll back clients first, then Hono; the additive indexes can remain safely or be removed through the down migration.

## Open Questions

- A formal room-resource model is intentionally deferred until the institution needs room capacity and room-level conflict management.
- Push reminders and external calendar subscription are intentionally deferred to a notification-specific change.
