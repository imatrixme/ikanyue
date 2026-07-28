## Verification Evidence

### Requirement coverage

- Booking storage, policy, identity, claims, conflicts, rollback migrations, and no-PocketBase-hooks guards are implemented in `ikanyue.mapi.hono`.
- Student and teacher booking commands use Hono-owned validation and PocketBase SDK Batch plans; the mini-program receives course, lesson-hour, appointment, teacher, and schedule terms only.
- The student mini-program provides booking options, slot selection, appointment history/detail, withdrawal, cancellation, refresh, pagination, and stable conflict recovery messages.
- The teacher mini-program provides a role-aware workbench, pending decisions, teaching calendar, appointment detail, linked lessons, weekly availability, and date overrides.
- Admin provides capability-scoped `/appointments` navigation, dashboard queues, list/calendar views, detail/reschedule/cancel workflows, policies, offerings, availability, overrides, conflicts, and backfill resolution.
- External one-shot workers expire pending requests, project fulfillment, and optionally deliver Outbox events. PocketBase remains storage-only and runs no hooks or cron logic.
- Rollout, rollback, scheduling, notification, and release-gate requirements are documented in `ikanyue.mapi.hono/docs/course-booking-rollout.md`.

### Automated evidence

- Hono: `npm run course-credits:test:coverage` passed 379 tests with 375 passed and 4 skipped. Coverage: 99.59% statements, 95.25% branches, 99.87% functions, 99.59% lines.
- Hono: `npm run lint` and `npm run swagger:collect` passed; Swagger collected 179 endpoints and 85 schemas.
- Taro: `npm run test:coverage` passed 87 tests. Coverage: 99.86% statements, 96.95% branches, 100% functions, 99.86% lines.
- Taro: `npm run lint`, `npm run build:weapp`, student-course boundary verification, compiled-output checks, and `npm run test:e2e` passed.
- Admin: `npm run test:coverage` passed 104 tests. Coverage: 98.08% statements, 95.05% branches, 97.78% functions, 99.80% lines.
- Admin: `npm run lint`, client/SSR `npm run build`, and 33 Playwright workflows across wide, compact, and mobile Chromium passed.

### Visual evidence

- WeChat DevTools skill `0.2.7` matched the installed tool and returned a valid logged-in `openid`.
- WeChat DevTools compiled WXML and WXSS for `appointments`, `appointmentBooking`, `appointmentSlots`, `appointmentDetail`, and `teacherAvailability` successfully.
- Simulator screenshots were visually checked for student appointment history, student booking entry, and teacher availability. The pages rendered without blank screens, horizontal overflow, clipping, or incoherent overlap.
- Admin mock screenshots were visually checked at 1440x1000 and 412x915. The appointment table/card modes, filters, summary metrics, navigation, and generated booking icon rendered without overflow or overlap.

### Deferred release gate

- Task 8.5 remains deliberately open. Docker migration, rollback, restored-volume, real PocketBase concurrency, backfill, and reconciliation checks run only immediately before release.
- Production notification dispatch remains disabled until an actual Outbox delivery adapter and credentials are configured; worker scheduling may be enabled independently.
