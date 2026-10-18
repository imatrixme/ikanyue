# Design: improve-admin-daily-operations

## Context

The Admin was reorganized by task in `redesign-admin-task-workspace`. This change closes the remaining gaps in daily operations. The API is Hono on PocketBase; the Admin is React with a mock API used by the tests.

## Decisions

### 1. Student overview is a read model, not a new collection

`GET /ops/course-credits/student-overview?studentIds=a,b` (finance capability) returns one item per id:
- the account quantities
- `nextLesson`: the earliest upcoming, non-cancelled session the student is on
- `followUp`: the latest follow-up entry

It accepts 1–100 ids; anything else is `STUDENT_IDS_INVALID`. The Admin calls it in chunks of 100 for the rows it shows.

- Why: the student list is paged by the platform student API, which knows nothing about course credits. Joining on the client for the visible page keeps the platform API untouched.
- Trade-off: sorting by balance applies only within the loaded page. That is stated in the proposal as a non-goal.

### 2. Follow-ups are append-only audit entries

`POST /ops/course-credits/students/:studentId/follow-ups` writes an `ops_audit_logs` row:
- `action = course_operations.students.follow_up`
- `resourceType = students`
- `metadata = {status, note, snoozeUntil}`

Validation:
- `status` is `contacted` or `declined`.
- `snoozeUntil` must be in the future.
- `note` is trimmed and capped at 300 characters.
- The student must exist.

Why: there is no migration, history comes for free, and the audit log already carries the actor and the time. The latest entry wins.

### 3. Today asks for exactly what it shows

Each Today group runs its own narrow query:
- Today's lessons: `from`/`to` on `startAt`, using Shanghai midnight to the next midnight.
- Unsettled lessons: `status=completed` and `status=correction_pending`.
- Renewal candidates: `accounts?renewalThreshold=2`. The server applies the same rule as before: consumed + expired > 0, available ≤ threshold, frozen = 0.
- Workload and exceptions: counts from `totalItems`.

Every list is read through `listAllPages`:
- 100 rows per request, at most 2,000 rows.
- It returns `{items, totalItems, truncated}`.
- `TruncationNotice` prints "仅显示前 N 条，共 M 条" when the bound is hit.

The same helper replaces every former `perPage: 100` read in the Admin: lessons, classes, enrollments, accounts, catalog resources, the calendar and booking conflicts. Booking policies and offerings keep their own small paged API.

### 4. Booking on behalf of a student reuses the student path

`POST /ops/course-bookings/appointments` (academic capability) calls `appointmentRequestService.createRequest` with the target `studentId`. Slot, balance, duplicate and policy checks therefore run exactly as they do for the miniapp.

With `confirm: true`:
- The handler passes the `reservation` feature gate.
- It calls `appointmentDecisionService.confirm` with a derived idempotency key, `<key>:confirm`.

A retry of the whole command replays both steps instead of creating a second appointment.

Two read endpoints feed the dialog:
- `GET .../students/:studentId/options` lists the courses and teachers the student can book.
- `GET .../students/:studentId/slots?offeringId=` lists open slots.

### 5. Lesson-day flow

`lessonStep(lesson, roster)` returns:
- 0 (点名): an open lesson where some roster entry is still `scheduled`
- 1 (结束课堂): an open lesson where every roster entry is marked
- 2 (核销): completed or correction pending
- 3: settled
- null: draft or cancelled

The drawer renders the steps with `aria-current="step"`. The current step's button is the primary one.

On Today, open lessons get a "全部到课" row action (`markAllPresent`). After success the button changes to the disabled "已全部到课", without reloading the page.

### 6. Feedback and filters

`NotifyProvider` lives in `Shell`:
- A fixed `role="status"` region shows at most three notices.
- Each notice auto-dismisses after 4 seconds.
- `useNotify()` is a no-op outside the provider, so components and tests work without it.
- Errors stay inline. Toasts only confirm success.

The students and points lists use `useUrlFilters`:
- URL parameters win.
- Without them, the last filters saved in localStorage apply.
- Writes replace history instead of pushing to it.

### 7. Time zone

The business runs in Asia/Shanghai, so the Admin no longer depends on the browser's time zone for these fields:
- `datetime-local` values go through `shanghaiLocalInput` / `shanghaiLocalInputToIso`. This covers the generic resource editor, lesson edit and reschedule.
- Date keys use `dateKeyInShanghai`. This covers the booking-exception minimum date, the appointment calendar grouping and the statements default.
- Booking exceptions convert date and time with an explicit `+08:00` offset.

## Today visibility

| Group | Capability |
|---|---|
| 今日课堂 | academic (all lessons) or teacher (assigned lessons) |
| 待确认预约 | academic |
| 待核销课堂 | settlement |
| 需要续课 | finance |
| 报课后待同步名单 | finance |
| 异常 | settlement (settlement exceptions) or audit (reconciliation exceptions) |
| 待确认工作量 | teacher |

## Risks

- **`listAllPages` costs up to 20 requests per list.** That is acceptable at the current data size, and the bound plus the notice make the limit visible. Server-side aggregation is the follow-up if any list regularly reaches it.
- **Follow-ups are hidden only by `snoozeUntil`.** A follow-up without a future snooze date cannot be recorded, which keeps the rule simple.
