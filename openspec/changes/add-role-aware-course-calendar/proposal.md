## Why

The current calendar surfaces do not share one scheduling truth: the teacher calendar reads appointment requests and therefore omits class and Admin-created lessons, while the learner home projects only one upcoming lesson and the Admin has no institution-wide timetable. A role-aware calendar built from formal `sessions` is needed so the institution, teachers, and learners see consistent scheduling information without exposing internal course-credit concepts.

## What Changes

- Add an institution-wide Admin timetable with day, week, month, and list views, URL-stable filters, conflict indicators, and lesson detail actions.
- Replace the teacher appointment-only calendar projection with a schedule projection that includes every assigned formal lesson, plus an optional availability overlay.
- Add a lightweight upcoming-lessons projection for mini-program home surfaces and expand learner course pages from one upcoming lesson to the next three.
- Add role-safe Hono schedule APIs backed by `sessions`, `session_teachers`, `session_students`, and `session_classes`; appointment requests remain workflow records rather than formal calendar events.
- Add calendar-oriented query indexes, range limits, stable projections, timezone rules, optimistic-version conflict handling, and compatibility for the existing teacher calendar endpoint.
- Add deterministic unit, API, build, responsive, and compiled-output verification with at least 95% coverage across affected Hono, Admin, and Taro scopes.
- Keep PocketBase as storage only, preserve the no-hooks boundary, and defer release-only Docker migration and rollback verification to the final release gate.

## Capabilities

### New Capabilities
- `role-aware-course-calendar`: Defines the shared formal-lesson source, institution timetable, teacher calendar, learner upcoming schedule, role-safe projections, and calendar consistency rules.

### Modified Capabilities
- `ops-admin-system`: Adds the institution timetable as a first-class Admin workspace using Hono APIs and existing lesson command services.
- `miniapp-page-api-unit-coverage`: Adds registered calendar and upcoming-lesson page/API behavior to deterministic Taro and Hono coverage.
- `subproject-unit-test-coverage`: Raises affected calendar implementation coverage gates to at least 95% for all four metrics in Hono, Admin, and Taro.

## Impact

- Root: OpenSpec artifacts only; no root JavaScript workspace or dependency changes.
- `ikanyue.mapi.hono`: schedule query service, role-scoped APIs, schema indexes, compatibility adapter, tests, and OpenAPI output.
- `ikanyue.admin`: institution timetable route, navigation, calendar renderer, filters, detail drawer integration, responsive behavior, tests, and build output.
- `ikanyue.taro3`: activity-home upcoming schedule, learner three-lesson projection, teacher schedule calendar, role-aware navigation labels, tests, and WeChat build output.
- Not affected: Website, Flutter, mobile Nuxt, production data, and release infrastructure.
