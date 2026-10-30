## 1. Tests first

- [ ] 1.1 Period ranges: today, week (Monday start) and month in Beijing time, including a Sunday and the last day of a month; invalid period refused.
- [ ] 1.2 Dashboard numbers: confirmed lessons and credits used by start time, cancelled and unconfirmed lessons excluded, undone confirmation drops out; granted credits without compensation batches; recorded paid amount from granted orders; booking requests and cancellations; new students.
- [ ] 1.3 Teacher rows only with several teachers, substituted lessons count for the substitute; renewal list order and limit; hired teacher gets 403.

## 2. Server (`kanyue.server`)

- [ ] 2.1 `ownerDashboard(app, period, now)` in `coursecredit` per design §1–§4, time filters through `filterTime`.
- [ ] 2.2 `GET /v1/workbench/dashboard` behind `managing(administrator)`; contract test; `gofmt`, `go vet`, `go test`.

## 3. Gateway

- [ ] 3.1 Add the route to `kanyue.gateway/internal/exposure/mapi.json`; `node --test scripts/gateway-exposure.test.mjs`.

## 4. Mini program (`ikanyue.mini`)

- [ ] 4.1 `Api.getWorkbenchDashboard(period)` and `normalizeDashboard` in `core/workbench.js`.
- [ ] 4.2 Workbench entry for the owner; `pages/workbenchDashboard` with period tabs, number cards, teacher rows and renewal list.
- [ ] 4.3 Unit tests; `pnpm lint`, `TZ=Asia/Shanghai pnpm test`; `test:live` opens the dashboard as the owner.

## 5. Verification

- [ ] 5.1 WeChat DevTools walk-through as the owner (three periods) and as a solo owner, with screenshots.
- [ ] 5.2 `openspec validate add-owner-dashboard --strict`.
