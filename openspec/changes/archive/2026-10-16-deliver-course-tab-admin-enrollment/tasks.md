## 1. Contract And Boundary Alignment

- [x] 1.1 Add shared student-learning projection schemas and forbidden internal-field contracts in Hono.
- [x] 1.2 Update Swagger aggregation with student learning and Admin course-operation routes.
- [x] 1.3 Add a verifier proving Taro course pages do not call legacy student course-credit mutation APIs.

## 2. Hono Student Learning Projection

- [x] 2.1 Implement learning overview projection for next lesson, enrolled courses, warnings, and recent records.
- [x] 2.2 Implement student course detail projection with remaining, scheduled, completed, validity, sources, and recent lessons.
- [x] 2.3 Implement paginated lesson list/detail and lesson-hour record projections using authenticated student identity only.
- [x] 2.4 Add `/v1/student/learning/*` handlers, routes, stable experience errors, and privacy-safe responses.
- [x] 2.5 Add Hono projection unit and route tests covering ownership, pagination, empty data, vocabulary, and forbidden fields.

## 3. Hono Admin Course Commands

- [x] 3.1 Add validated create/update/status commands for course specifications, packages, grant lines, price versions, classes, and lessons.
- [x] 3.2 Implement automatic enrollment main transaction for order snapshot, course-hour grant, optional class membership, audit, and sync outbox.
- [x] 3.3 Implement enrollment idempotency replay and published-future-lesson synchronization preview/confirmation.
- [x] 3.4 Add manual attendance update, bulk-present, actual-teacher confirmation, and settlement preview commands.
- [x] 3.5 Wire Admin command routes, capabilities, Swagger, and stable error responses.
- [x] 3.6 Add Hono command tests for authorization, validation, rollback, duplicate enrollment, roster synchronization, attendance, preview, and settlement failure.

## 4. Mini Program Course Tab

- [x] 4.1 Register the “活动、课程、积分、我的” tab order and matching course tab icon asset.
- [x] 4.2 Replace the course-credit overview with a read-only “我的课程” tab using student learning projections.
- [x] 4.3 Implement course detail with remaining/scheduled/completed hours, validity, sources, and recent lessons.
- [x] 4.4 Implement course schedule tabs, lesson detail, and paginated lesson-hour records with pull-to-refresh.
- [x] 4.5 Remove student-visible conversion, batch, frozen-credit, reservation, and raw event entry points and copy.
- [x] 4.6 Add reusable course summary, lesson row, validity notice, record row, and contact-teaching components using existing design tokens.
- [x] 4.7 Add Taro unit tests for projection mapping, navigation, loading/empty/error states, pagination, and forbidden vocabulary.
- [x] 4.8 Update compiled-output contracts and build the WeChat mini program successfully.

## 5. Admin Routed Shell And Shared Infrastructure

- [x] 5.1 Add React Router and migrate the shell from `AppView` state to capability-scoped URL routes.
- [x] 5.2 Preserve login, password change, students, points, and rewards in the routed shell.
- [x] 5.3 Add course-operation API clients, domain types, query state, and reusable list/detail/action primitives.
- [x] 5.4 Add Admin routing, capability, API-client, SSR, and existing-workflow regression tests.

## 6. Admin Course Workspaces

- [x] 6.1 Implement dashboard queues for lessons, enrollment sync, insufficient hours, settlement, expiry, teacher workload, and exceptions.
- [x] 6.2 Implement course specification and package/price workspaces with tables, drawers, validation, and status actions.
- [x] 6.3 Implement automatic enrollment list, detail, and reviewed workflow with optional class assignment.
- [x] 6.4 Extend student detail with courses, classes, lesson records, points, and enrollment entry.
- [x] 6.5 Implement class workspace for roster, teachers, term, future lessons, enrollment, transfer, and removal.
- [x] 6.6 Implement lesson workspace for creation, publication, roster eligibility, reschedule, cancellation, actual teachers, and manual attendance.
- [x] 6.7 Implement settlement preview/confirm/correction, lesson-hour account, teacher workload, exception, and audit workspaces.
- [x] 6.8 Add responsive Admin workflow tests for tables, drawers, dialogs, focus restoration, role denial, and critical happy/error paths.

## 7. Coverage And Verification

- [x] 7.1 Configure scoped Hono coverage with 95% lines, branches, functions, and statements and make it pass.
- [x] 7.2 Configure scoped Taro coverage with 95% lines, branches, functions, and statements and make it pass.
- [x] 7.3 Configure scoped Admin coverage with 95% lines, branches, functions, and statements and make it pass.
- [x] 7.4 Run Hono lint, hook guard, Swagger build, and relevant non-Docker local tests.
- [x] 7.5 Run Taro unit tests, coverage, WeChat build, compiled contracts, and WeChat IDE harness where available. The IDE harness was attempted but unavailable because the local login had expired.
- [x] 7.6 Run Admin unit tests, coverage, build, SSR render, and responsive browser verification.
- [x] 7.7 Validate OpenSpec strictly, audit every requirement against evidence, and record remaining release-only Docker checks in `verification.md`.
