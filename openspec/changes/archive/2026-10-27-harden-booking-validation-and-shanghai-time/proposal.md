## Why

`improve-admin-daily-operations` left two follow-ups.

1. **Operator booking was tested only against mocks.** Running 代约 → 确认 → 结课 → 核销 against the local native stack exposed three real defects:
   - The Admin "代约一对一" dialog requested slots without `from`/`to`. The server rejects that with "日期无效", so the dialog could never list a slot.
   - PocketBase stores dates as `YYYY-MM-DD HH:MM:SS.sssZ` and compares filter literals as text. Booking and schedule queries passed ISO `...T...Z` literals. On the same UTC day, an ISO literal therefore sorts after every stored value, and active schedule claims were missed:
     - Creating a request for an already-claimed slot passed the slot check. Only confirmation, which reads the stored format, caught it.
     - Date filters on appointment lists dropped or kept boundary rows.
   - A one-step "代约并确认" whose confirmation failed left a pending request behind. Because the Admin uses a new idempotency key per click, the next attempt failed with "这门课程已有待确认预约". A confirmation that closed the request (for example, credits gone) was reported as success.
2. **Some Admin dates still followed the browser time zone.** Display formatting (`formatDateTime`, `formatDate` and the local `toLocale*` calls), the booking-queue date filter, the conflict filter, the reschedule and policy dialogs, the migration editor and the "today" cutoff on the lessons page still used browser-local time. An operator outside China saw shifted times and filtered on the wrong day.

## What Changes

- **Admin slot window.** The operator slot request sends a 30-day `from`/`to` window, the same as the mini program. The booking policy's `maxAdvanceDays` still caps it.
- **Booking filters use the stored format.** A `filterTime` helper in `booking/time.js` normalizes instants to the PocketBase format. It is used in every booking and schedule date filter:
  - `booking/queryService` claims and appointment lists
  - `booking/opsQueryService`
  - `booking/backfillService`
  - `schedule/queryService`
  - `schedule/availabilityWindows`
- **One-step operator booking cleans up after itself.**
  - With `confirm: true`, the reservation feature gate is checked before anything is created.
  - If confirmation throws, the new request is withdrawn on the student's behalf with the reason "代约确认失败，已自动撤回", under the key `<key>:withdraw`. The original error is then returned.
  - If confirmation closes the request instead of confirming it, the command fails with `APPOINTMENT_CONFIRM_CLOSED`.
- **Repeatable local smoke.** `pnpm course-bookings:smoke:local` (`scripts/smoke-operator-booking-local.js`) runs against the local native stack only:
  - Books and confirms a lesson, then replays the same key.
  - Checks the one-credit reservation and that a second booking of the same slot is rejected.
  - Moves the local lesson into the past, then marks attendance, confirms the lead teacher and completes the lesson.
  - Settles the lesson, replays the settlement and tries a second settlement key.
  - Asserts that exactly one credit was consumed.
- **Shanghai time everywhere in the Admin.** Every `zh-CN` date formatter sets `timeZone: 'Asia/Shanghai'`, and `localDateKey` uses the Shanghai day. Date filters build `+08:00` day bounds. Datetime dialogs use `shanghaiLocalInput` / `shanghaiLocalInputToIso`. The lessons "today" cutoff uses `shanghaiDayStartIso`.
- **Payment review (mock channel only, no merchant key).** A strict review of `kanyue.pay` and the Hono commerce layer found no money-movement defect. One boundary defect of the same class was fixed: the finance order list's `created` date filter now uses `filterTime`, so orders created between 00:00 and 08:00 Shanghai time are no longer dropped or misfiled. The remaining findings are reported, not changed.

## Impact

- Affected specs: `course-booking` (operator booking, time-range filters) and `admin-daily-operations` (Shanghai time).
- Affected code:
  - `ikanyue.mapi.hono`:
    - `src/routes/courseCredits/bookingHandlers.js`
    - `src/services/courseCredits/booking/{time,queryService,opsQueryService,backfillService}.js`
    - `src/services/courseCredits/schedule/{queryService,availabilityWindows}.js`
    - `src/services/commerce/operations.js`
    - `scripts/smoke-operator-booking-local.js`, `package.json`
    - tests
  - `ikanyue.admin`:
    - `src/app/{bookingApi,coursePresentation}.ts`
    - booking, lessons, migration, students, points and commerce views
    - tests
- No schema, data migration or public contract change. The slot endpoint already required `from`/`to`.
- Not covered: other course-credit filters still build ISO literals. These are batch expiry, outbox scheduling, student learning, enrollment roster and the lesson "upcoming" query, and they are reported as follow-up drift.
