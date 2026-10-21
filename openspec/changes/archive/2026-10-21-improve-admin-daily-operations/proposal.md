## Why

After `redesign-admin-task-workspace`, a review of the Admin found ten remaining interaction problems:

1. **Finding a student is slow.**
   - The student list hides the lesson-hour balance and the next lesson.
   - The only way to find someone is to open 学员 and search.
2. **Lesson day is scattered.** Taking attendance, completing the lesson and settling it are separate buttons in a drawer and a separate dialog, and nothing says which step comes next. Today lists the lessons but cannot act on them.
3. **Lists stop at 100 records.**
   - Today, the student page, lesson hours, classes and lessons load only the first page of 100.
   - Pending work beyond that is dropped without any notice.
4. **The decorative chrome is only partly gone.** Filter bars, table hovers and dialogs still use the brand wash. The bookings and points pages still open with counter bands, and sections still carry descriptive subtitles.
5. **Refunds use the browser `window.confirm`.** That is the least careful confirmation in the Admin, and it guards an action that moves money.
6. **Several places still compute dates in UTC.**
   - A new price's "生效时间" defaults to UTC wall time, and editing any catalog datetime shows the raw UTC value.
   - Editing or rescheduling a lesson pre-fills UTC wall time, so saving shifts the lesson by eight hours.
   - The earliest date for a booking exception is yesterday before 08:00, and the appointment calendar groups early-morning bookings under the previous day.
   - The statements date adds eight hours by hand.
7. **Feedback after actions and filters is uneven.**
   - Most commands give no confirmation after success.
   - The students and points lists keep their filters in component state, so a refresh or a shared link loses them.
8. **Staff cannot book a one-to-one lesson for a student.** When a student phones in, 教务 have no way to create the appointment.
9. **Renewal reminders cannot be followed up.** A student stays on Today every day, even after someone has called them.
10. **Who sees which task on Today is implicit.** It is decided by capabilities, but nothing documents it.

## What Changes

- **Student overview (backend).** A new `GET /ops/course-credits/student-overview?studentIds=` returns, for up to 100 students:
  - available, frozen, consumed and expired hours
  - the next upcoming lesson
  - the latest renewal follow-up
- **Student list (frontend).**
  - Adds 剩余课时 and 下节课 columns, plus a 剩余课时 sort within the page.
  - Filters live in the URL.
- **Global student search.** A search box in the top bar opens the student detail page. Press `/` to focus it.
- **Lesson flow.**
  - The lesson drawer shows a step bar, 点名 → 结束课堂 → 核销, and the current step is the primary action.
  - Today's lesson rows offer "全部到课" while attendance is open.
- **No silent truncation.**
  - Session list queries accept `from`/`to` on `startAt`.
  - The account list accepts `studentIds` and `renewalThreshold`.
  - Admin reads every page through a bounded `listAllPages` helper (at most 2,000 rows) and shows "仅显示前 N 条" when the bound is reached.
  - Today asks only for the rows it needs: today's lessons, lessons awaiting settlement and renewal candidates.
- **Quiet visuals everywhere.**
  - Hover and selection use the muted surface instead of the brand wash.
  - The counter bands on bookings and points are removed.
  - Section subtitles that only restate the title are removed. Subtitles that give counts or dates stay.
- **Refund confirmation.** Refund and mock refund use `ConfirmDialog`, which states the amount and the effect.
- **Shanghai dates everywhere.** `datetime-local` inputs show and submit Shanghai wall time; date keys use the Shanghai calendar day.
- **Feedback.**
  - A small toast confirms successful commands: booking decisions, attendance, completion, settlement, enrollment, refunds and follow-ups.
  - Students and points filters are kept in the URL.
- **Booking on behalf of a student (backend + frontend).**
  - New endpoints:
    - `GET /ops/course-bookings/students/:studentId/options`
    - `GET /ops/course-bookings/students/:studentId/slots`
    - `POST /ops/course-bookings/appointments`
  - The POST reuses the student request path, so every slot, balance and duplicate rule still applies. With `confirm: true`, the same command also confirms the appointment.
  - The student page and the bookings page get "代约一对一".
- **Renewal follow-up (backend + frontend).**
  - `POST /ops/course-credits/students/:studentId/follow-ups` records "已联系" or "暂不续" with a note and a snooze date.
  - The follow-up is stored as an append-only `ops_audit_logs` entry, so no schema changes.
  - Today hides a renewal row until the snooze date. The student page lists follow-ups.
- **Today visibility by capability**, now documented:

  | Group | Capability |
  |---|---|
  | 今日课堂 | academic or teacher (teachers see assigned lessons only) |
  | 待确认预约 | academic |
  | 待核销 | settlement |
  | 需要续课 | finance |
  | 待同步名单 | finance |
  | 异常 | settlement (核销异常) or audit (对账异常) |
  | 待确认工作量 | teacher |

  The renewal threshold stays at 2 hours and is shown in the group title.

## Non-goals

- No new PocketBase collections or migrations.
- No change to booking policies, slot rules or settlement rules. Booking on behalf of a student uses the same validation as the miniapp.
- No server-side sort of students by balance. The sort applies within the loaded page.

## Impact

- Specs:
  - new `admin-daily-operations`
  - `course-booking` (ADDED: operator booking on behalf of a student)
- Code:
  - `ikanyue.mapi.hono`: ops query service and handlers, booking handlers and routes, swagger, tests.
  - `ikanyue.admin`: API clients, Today, students, student detail, lessons, bookings, orders, catalog, booking dialogs, statements, visual tokens, tests and e2e.
