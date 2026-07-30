## 1. Contract and Storage Query Shape

- [x] 1.1 Add calendar lookup indexes to course-credit schema definitions and generate a reversible additive PocketBase migration without running release Docker verification.
- [x] 1.2 Implement bounded UTC calendar range parsing, status normalization, batched relation loading, and shared schedule projection helpers.
- [x] 1.3 Implement role-specific Admin, teacher, learner, and lightweight upcoming projections with explicit internal-field exclusion tests.
- [x] 1.4 Add teacher availability-window expansion for recurring rules and active date overrides without treating availability as formal lessons.

## 2. Hono APIs

- [x] 2.1 Add the academic-capability-protected institution timetable endpoint with teacher, learner, class, course, status, and origin filters.
- [x] 2.2 Add the teacher formal schedule endpoint and make the existing teacher calendar endpoint a compatibility adapter over formal sessions.
- [x] 2.3 Add the role-aware upcoming schedule endpoint limited to three lessons and extend learner overview and lesson projections with teacher and class labels.
- [x] 2.4 Add stable validation and conflict error contracts, OpenAPI definitions, route registration, and deterministic API tests.

## 3. Admin Institution Timetable

- [x] 3.1 Add Admin calendar API types, client methods, first-class navigation, route state, and the generated calendar business icon mapping.
- [x] 3.2 Implement tested date-range, month-grid, interval-lane, overlap, label, and responsive fallback helpers without adding a root or unrelated dependency.
- [x] 3.3 Implement the full-width institution timetable with day, week, month, and list modes plus URL-stable date and entity filters.
- [x] 3.4 Integrate lesson detail, existing reschedule/cancel commands, version conflict refresh, loading, empty, error, and narrow-screen states.
- [x] 3.5 Add Admin unit, SSR, responsive interaction, filter, calendar layout, detail-action, and navigation tests while keeping files within 500 lines.

## 4. Mini-Program Role Calendars

- [x] 4.1 Add Taro schedule API adapters, role-safe normalization, date-strip helpers, shared upcoming lesson component, and local caching keyed by role.
- [x] 4.2 Add the independent upcoming-lessons module to activity home with next-three ordering, hidden empty state, restrained retry, and role-specific navigation.
- [x] 4.3 Expand learner course home to three upcoming lessons and enrich full lesson rows with teacher, class, time, location, and user-facing status.
- [x] 4.4 Replace the teacher appointment list calendar with a seven-day date strip, daily formal-lesson agenda, availability toggle, refresh, and full lesson navigation.
- [x] 4.5 Rename the teacher role Tab to “日历”, preserve learner tabs, clear role-scoped schedule state on identity switches, and retain pull-down refresh behavior.
- [x] 4.6 Add Taro page-logic, API, role, empty/error, pagination, compiled-output, page-registration, and internal-terminology boundary tests.

## 5. Verification and Evidence

- [x] 5.1 Run Hono lint, focused tests, complete course-calendar tests, and a coverage command enforcing at least 95% for lines, branches, functions, and statements.
- [x] 5.2 Run Admin lint, unit tests, coverage, production/SSR builds, and desktop/narrow responsive calendar verification.
- [ ] 5.3 Run Taro lint, unit tests, 95% affected-scope coverage, WeChat build/output checks, and WeChat DevTools compile plus visual checks.
- [x] 5.4 Validate the OpenSpec change strictly, record requirement-by-requirement evidence, confirm Website/Flutter/root dependency neutrality, and document release-only Docker migration/rollback verification as deferred to the release gate.

## Verification Evidence

- Hono: `npm test` passed 475 tests with 4 environment skips; lint and Swagger build passed. Calendar coverage is 100% statements, 98.29% branches, 100% functions, and 100% lines. The broader course-credit coverage gate is 97.11% statements/lines, 95.27% branches, and 95.03% functions.
- Admin: lint passed; 118 unit tests and 36 Playwright tests passed. Calendar coverage is 100% statements/lines/functions and 96.15% branches. Client and SSR production builds passed; the existing bundle-size warning remains non-blocking.
- Mini-program local gates: lint and 102 unit tests passed. Calendar coverage is 100% statements/lines/functions and 97.66% branches. Student boundary, WeChat build/output checks, and build E2E passed; existing CSS-order and stale Browserslist warnings remain non-blocking.
- Mini-program DevTools: blocked because the official WeChat DevTools reports `loginExpired: true`; the login QR flow has been reopened. Task 5.3 remains incomplete until DevTools compile and visual checks run after login.
- Scope: only `ikanyue.mapi.hono`, `ikanyue.admin`, `ikanyue.taro3`, and this OpenSpec change were modified. Website, Flutter, and root dependency files remain untouched.
- Release gate: Docker-based PocketBase migration apply/rollback and query-plan verification were deliberately not run during continuous development and remain mandatory before release.
