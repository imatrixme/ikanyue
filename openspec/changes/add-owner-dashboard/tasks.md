## 1. Tests first

- [x] 1.1 Period ranges: today, week (Monday start) and month in Beijing time, including a Sunday and the last day of a month; invalid period refused; an earlier month with previous/next, a future or malformed month refused.
- [x] 1.2 Dashboard numbers: confirmed lessons and credits used by start time, cancelled and unconfirmed lessons excluded, undone confirmation drops out; granted credits without compensation batches; booking requests and cancellations; new students.
- [x] 1.3 Teacher rows only with several teachers, substituted lessons count for the substitute; teacher reconciliation lists the same lessons and totals; hired teacher gets 403.
- [x] 1.4 Renewal list order and limit; long-absence list: 21-day rule, never-attended students by first grant, booked students excluded, students without credits excluded.

## 2. Server (`kanyue.server`)

- [x] 2.1 `ownerDashboard` and `teacherReconciliation` in `coursecredit` per design §1–§4, time filters through `filterTime`.
- [x] 2.2 Routes in design §5 behind `managing(administrator)`; contract test; `gofmt`, `go vet`, `go test`.

## 3. Gateway

- [x] 3.1 Add the routes to `kanyue.gateway/internal/exposure/mapi.json`; `node --test scripts/gateway-exposure.test.mjs`.

## 4. Mini program (`ikanyue.mini`)

- [x] 4.1 `Api.getWorkbenchDashboard(period, month)`, `Api.getWorkbenchTeacherReconciliation(teacherId, period, month)`; normalizers in `core/workbench.js`.
- [x] 4.2 Workbench entry for the owner; `pages/workbenchDashboard` (period tabs, month stepping, number cards, teacher rows, two attention lists) and `pages/workbenchTeacherLessons`.
- [x] 4.3 Unit tests; `pnpm lint`, `TZ=Asia/Shanghai pnpm test`; `test:live` opens the dashboard and a teacher's lessons as the owner.

## 5. Verification

- [x] 5.1 WeChat DevTools walk-through as the owner (three periods, reconciliation) and as a solo owner, with screenshots.
- [x] 5.2 `openspec validate add-owner-dashboard --strict`.
