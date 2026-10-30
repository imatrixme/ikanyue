## 1. Tests first

- [ ] 1.1 Server cases for the permission matrix: administrator teacher, finance-only, settlement-only and teacher-only sessions against every `/v1/workbench/*` route (allowed vs 403), including a teacher who loses administrator status after signing in.
- [ ] 1.2 `confirmLesson` cases: confirm after start with one absence, before start (`LESSON_NOT_STARTED`), someone else's lesson without `academic`, the same idempotency key twice, an already settled lesson (`SESSION_ALREADY_SETTLED`), and re-confirming after an undo (`correction_pending` skips the completion step).
- [ ] 1.3 Grant case: a discounted offline grant keeps list price and received amount and adds the lessons to the student's ledger; a hired teacher gets 403.

## 2. Server (`kanyue.server`)

- [ ] 2.1 Workbench module with the routes in design.md §6 under the mini program session and tenant scope; teaching routes check the session's `teacher` capability with the `assigned` scope (`global` with `academic`).
- [ ] 2.2 Per-request management check: re-read the teacher by session id and require active plus `isAdmin` or the route's capability.
- [ ] 2.3 `confirmLesson`: attendance, completion and settlement in one transaction with the teaching idempotency key and an audit entry naming the actor; settlement does not require `settlement` here.
- [ ] 2.4 Queries: `summary` (permissions, active teacher count, waiting lesson and pending request counts), pending lessons, students, ledger and sellable packages in teacher-safe language.
- [ ] 2.5 Grants call `enroll` with `channel: offline`; students reuse the `students` create and list rules.
- [ ] 2.6 Contract tests for the new routes; `gofmt`, `go vet`, `go test` per the root `AGENTS.md`.

## 3. Gateway

- [ ] 3.1 Add the workbench routes to `kanyue.gateway/internal/exposure/mapi.json` (default policy set); `node --test scripts/gateway-exposure.test.mjs` stays green.

## 4. Mini program (`ikanyue.mini`)

- [ ] 4.1 `services/apis.js` workbench calls; `summary` 404 keeps the original workbench.
- [ ] 4.2 Workbench sections by permission: waiting lessons with "确认上课" (absence picker), students entry, grant entry; teacher names and filters only when `teacherCount > 1`.
- [ ] 4.3 Pages: students (search, add), student ledger (grants, deductions, undo for `settlement`), grant (package, price version, received amount, confirmation), with empty states for no students and no packages.
- [ ] 4.4 Unit tests for the permission-to-section mapping and page logic; `pnpm lint`, `TZ=Asia/Shanghai pnpm test`.
- [ ] 4.5 `test:live`: owner adds a student, grants a package, the student books, the teacher confirms the lesson, the owner undoes it; a hired-teacher session sees only teaching sections.

## 5. Verification

- [ ] 5.1 WeChat DevTools walk-through as a solo owner and as a hired teacher, with screenshots.
- [ ] 5.2 `openspec validate add-owner-workbench --strict`.
