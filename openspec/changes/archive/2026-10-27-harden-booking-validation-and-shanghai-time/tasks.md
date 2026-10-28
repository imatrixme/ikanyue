# Tasks: harden-booking-validation-and-shanghai-time

## 1. Operator booking against real data (ikanyue.mapi.hono, ikanyue.admin)

- [x] 1.1 Run 代约 → 确认 → 结课 → 核销 against `node scripts/native-stack.mjs` and record the defects found.
- [x] 1.2 Send a 30-day `from`/`to` window from the Admin operator slot request and cover it in `bookingApi.test.ts`.
- [x] 1.3 Add `filterTime` and use it in every booking and schedule date filter, with a regression assertion on the claim filter.
- [x] 1.4 Check the reservation gate first, withdraw the request when one-step confirmation fails, and reject a confirmation that closed the request. Cover both paths in the route tests.
- [x] 1.5 Add `pnpm course-bookings:smoke:local` with idempotent replay, same-slot rejection, a double-settlement attempt and a one-credit balance check, and run it to a pass.
- [x] 1.6 Clean up the local records left by the failing runs.

## 2. Shanghai time in the Admin (ikanyue.admin)

- [x] 2.1 Pin every `zh-CN` formatter, plus `formatDateTime`, `formatDate` and `localDateKey`, to Asia/Shanghai.
- [x] 2.2 Build the booking-queue and conflict date filters from `+08:00` day bounds, and default the conflict filter to the Shanghai today.
- [x] 2.3 Use `shanghaiLocalInput` / `shanghaiLocalInputToIso` in the reschedule, policy and migration editors, and `shanghaiDayStartIso` for the lessons "today" cutoff.
- [x] 2.4 Make the Today fixtures zone-independent and add a test that formats and groups an instant by the Shanghai day.

## 3. Payment review (kanyue.pay, ikanyue.mapi.hono commerce, ikanyue.admin commerce)

- [x] 3.1 Review gateway auth, the mock gate, amounts, idempotency, optimistic concurrency, the payment/refund state machine, WeChat signing and decryption, statements and event delivery.
- [x] 3.2 Review Hono checkout, sync and grant, refunds, reservation cash cancellation, recovery and the event intake.
- [x] 3.3 Make the finance order `created` filter use `filterTime`, and update its test.
- [x] 3.4 `kanyue.pay`: `bun run typecheck`, `bun test`, `PAY_PB_INTEGRATION=1 bun test test/pocketbase.test.ts`.

## 4. Verification

- [x] 4.1 `ikanyue.mapi.hono`: `pnpm lint`, `TZ=Asia/Shanghai pnpm test`, `pnpm check-docs` (no new findings).
- [x] 4.2 `ikanyue.admin`: `npx tsc -b`, `npx eslint .`, `npm test` under `TZ=Asia/Shanghai` and `TZ=America/Los_Angeles`, `npm run build`, `npm run test:e2e`.
- [x] 4.3 `openspec validate harden-booking-validation-and-shanghai-time --strict`.
