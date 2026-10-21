# Tasks: improve-admin-daily-operations

## 1. API (ikanyue.mapi.hono)

- [x] 1.1 Accept `from`/`to` on session list queries, and `studentIds`/`renewalThreshold` on the account list.
- [x] 1.2 Add `GET /ops/course-credits/student-overview` with balance, next lesson and latest follow-up.
- [x] 1.3 Add follow-up record and list endpoints backed by append-only `ops_audit_logs` entries.
- [x] 1.4 Add operator booking options, slots and create endpoints, with an optional confirm in the same command.
- [x] 1.5 Document the new routes in swagger and regenerate `docs/swagger.json`.
- [x] 1.6 Cover the query service, follow-up service, routes and booking handler with tests.

## 2. Finding students

- [x] 2.1 Add the 剩余课时 and 下节课 columns and the in-page balance sort to the student list.
- [x] 2.2 Add global student search to the top bar, with the `/` shortcut and keyboard selection.
- [x] 2.3 Keep student and points filters in the URL.

## 3. Lesson day

- [x] 3.1 Show the 点名 → 结束课堂 → 核销 step bar in the lesson drawer and make the current step primary.
- [x] 3.2 Offer "全部到课" on Today's open lesson rows.

## 4. No silent truncation

- [x] 4.1 Add the `listAllPages`, `listAllCourseResource` and `listAllStudents` helpers, bounded at 2,000 rows.
- [x] 4.2 Replace every 100-row list read in the Admin, and show `TruncationNotice` on the main lists.
- [x] 4.3 Make Today query only today's lessons, unsettled lessons and renewal candidates.

## 5. Quiet visuals

- [x] 5.1 Replace the brand-wash hover and selection surfaces with muted ones.
- [x] 5.2 Remove the counter bands on bookings, points, rewards, workload and enrollments.
- [x] 5.3 Remove section subtitles that only restate the title.

## 6. Safety and dates

- [x] 6.1 Confirm refunds and mock refunds with `ConfirmDialog`, stating the amount and the effect.
- [x] 6.2 Use Shanghai time for `datetime-local` editing, booking exceptions, appointment grouping and the statements default.

## 7. Feedback, booking and renewal

- [x] 7.1 Add `NotifyProvider` and success toasts for booking decisions, attendance, completion, settlement, enrollment, refunds, follow-ups and operator booking.
- [x] 7.2 Add the "代约一对一" dialog to the bookings page (with a student picker) and the student page.
- [x] 7.3 Add renewal follow-ups to Today rows and the student page; hide snoozed students on Today.
- [x] 7.4 Document Today visibility by capability.

## 8. Verification

- [x] 8.1 Hono: `pnpm lint`, `TZ=Asia/Shanghai pnpm test`.
- [x] 8.2 Admin: `npm run lint`, `TZ=Asia/Shanghai npm test`, `npm run build`, `npm run test:e2e`.
- [x] 8.3 `openspec validate improve-admin-daily-operations --strict`.
