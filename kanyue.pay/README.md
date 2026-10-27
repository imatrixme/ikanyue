# kanyue.pay

Standalone Hono gateway pinned to Bun 1.4.1, backed by a separate PocketBase 0.32.0 store. Business orders, prices, refund rules and credits belong to business Hono. This directory has independent dependencies and a lockfile, not a root JS workspace.

## Local Development

From the parent, `./scripts/kanyue-stack.sh test up` starts native PB, gateway, Hono, workers, Admin and the miniapp watcher. Explicit `test init` bootstraps schema/fixtures; ordinary startup never migrates or seeds. Docker volumes are untouched. Gateway: http://127.0.0.1:1440; Admin: http://127.0.0.1:18180/payments.

Standalone: install the pinned runtime/dependencies, configure `.env.example`, explicitly run `bun run schema:apply`, then `bun run dev`. Existing installations need additive schema application for work, audit, statement and settlement entity kinds.

`bun test` runs contracts. `PAY_PB_INTEGRATION=1 bun test` also starts an isolated native PB and verifies actual restarts, never an existing database. `bun run typecheck` checks types. Parent `node scripts/commerce-smoke.mjs --tiered` exercises discounted purchase, grant, Admin booking confirmation, timed cash cancellation, failed-refund liability/retry and package refund through gateway restart. Test records are retained.

## Operator Entry

Use Admin's **收款与退款**, not the PB console:

- **订单管理**: search learner name/phone/course/order, filter status/China dates, inspect credits and actor audit, refund the server-quoted unused balance with reason and confirmation.
- **课程商品**: reference a package/price version, draft deadline tiers, publish explicitly or withdraw. Published rules are immutable; changes need a new version.
- **待处理异常**: unresolved money/fulfillment states, case notes, trusted recovery, verified resolution and exhausted-task reset/audit. Alerts are in-app, not external messaging.
- **账单与到账**: download/import an ALL trade bill, inspect matching/missing transactions and fees, export a formula-safe report, register finance-attested bank receipts separately. Finance retains original receipts; the system stores hashes.

Frontend calls business Hono with user authorization. No gateway token, merchant key or PB superuser credential enters browser/miniapp bundles.

## Gateway Contract

All `/v1/*` routes require `Bearer PAY_SERVICE_TOKEN` and configured-owner scope. Payment/refund creation requires `Idempotency-Key` (1-120 identifier characters). Amounts are positive integer CNY fen.

- `POST /v1/payments`: `{reference,amount,currency:"CNY",payerId,description}`. Authenticated business Hono supplies the WeChat payer.
- `GET /v1/payments/:id`, `POST /v1/payments/:id/close`, `POST /v1/payments/:id/refresh`.
- `POST /v1/refunds`: `{reference,paymentId,amount}`; `GET /v1/refunds/:id`. Pending refunds reserve principal atomically.
- `GET /v1/events`, `POST /v1/events/:id/ack`: durable at-least-once pull/ack. Configured `PAY_EVENT_URL` and distinct `PAY_EVENT_TOKEN` enable bounded push. Only HTTP 204 acknowledges delivery. Business `/internal/commerce/payment-events` reloads trusted results before acknowledging.
- `GET /v1/work`, `POST /v1/work/:id/retry`: persistent leases, backoff, exhaustion and reset with `{actorId,reason}`. The business proxy derives actor identity from authentication.
- `POST /v1/reconciliation`, `GET /v1/finance`: provider/ledger reconciliation and financial facts. Unknown fees/settlement are null, not invented zero. Historical findings remain after a fresh clean check.
- `GET /v1/statements`, `GET /v1/statements/:id`, `POST /v1/statements/download`, `POST /v1/statements/import`, `GET /v1/statements/:id/export`, `POST /v1/statement-lines/:id/resolve`, `POST /v1/statements/:id/settlement`.
- `/health` checks liveness; `/ready` checks storage. `POST /callbacks/wechatpay` verifies raw-byte platform signature, timestamp, decryption, merchant/reference/amount binding and durable application before 204.

`/_test/observations/:id`, `/_test/poll`, `/_test/wechatpay/notify/:id` exist only in development/test mock modes behind separate `PAY_MOCK_TOKEN`. They change independent mock channel state, not business orders. Mock launch parameters MUST NOT invoke the real cashier.

## WeChat and Statements

`PAY_PROVIDER=wechatpay-mock` uses the protocol adapter with an injected signed HTTP peer. RSA/API-v3 keys are ephemeral; independent channel records survive restart. Old generic mock payments keep their channel and cannot be sent to WeChat. Tests cover signatures, encrypted callbacks, misbound receipts, duplicate events, uncertain submissions and refund ABNORMAL/CLOSED semantics.

Live implementation includes allowlisted HTTPS transport without redirects, protected credential files, certificate/private-key matching, expiry/serial checks and up to five pinned platform keys for explicit overlap-and-restart rotation. Each payment has a 30-minute window: prepay is created once with `time_expire`, and expired pending payments are closed at the channel instead of renewed. Polling reads only pending payments, processing refunds and unapplied provider results, so scan cost does not grow with history; the event feed returns at most 100 unacknowledged events per call. The miniapp calls `requestPayment` only for `mock:false` and refreshes business state after cancellation/uncertain results. Only server verification grants credits.

Statements use the official ALL delimiter/backtick format, signed fees and strict identity/date/summary checks with bounded size, not a general RFC CSV parser. Signed download metadata and content hashes are verified. Manual imports retain unverified provenance. Same-date imports are immutable by hash: differing files cannot silently overwrite evidence. Live download requires a past date; current-day mock snapshots can change after further tests and must not overwrite an earlier snapshot.

Matching covers amounts, receipt IDs, original payment, state and missing captured payments/accepted refunds. Refund bills snapshot acceptance day, not final refund completion. Legacy receipts without channel acceptance time cannot automatically participate in daily missing-refund detection. Bank evidence is separate from trade totals, not an automatic bank feed or tax ledger.

Protocol references, checked 2026-09-06: [JSAPI/prepay validity](https://pay.wechatpay.cn/doc/v3/merchant/4012791911), [ALL bill format](https://pay.wechatpay.cn/doc/v3/merchant/4013071246), [bill metadata](https://pay.wechatpay.cn/doc/v3/merchant/4013071238), [refund acceptance time](https://pay.wechatpay.cn/doc/v3/merchant/4012791884).

## Release Gate

**No real charging was enabled or tested.** Mock providers fail in production. Live startup requires `NODE_ENV=production`, `PAY_PROVIDER=wechatpay`, `PAY_LIVE_ENABLED=true`, `PAY_RELEASE_APPROVAL=merchant-live-acceptance-approved`, protected credentials and no mock token. Configuration gates are not merchant approval evidence.

`bun scripts/maintenance.ts backup payment|business [--native]` creates a PB backup, extracts into a fresh temporary directory, checks read-only SQLite integrity/counts and writes a restrictive SHA-256 report. It retains server backups and never overwrites active data. Archive ZIP/report into approved durable off-host storage; temporary paths are not retention policy. This verifies extraction/data integrity, not a full restored-stack process rehearsal.

`bun scripts/maintenance.ts preflight` requires valid live credentials, immutable image digest, clean root/subproject worktrees, recent matching backup reports (`PAY_BACKUP_REPORT`, `BUSINESS_BACKUP_REPORT`), and explicit `PAY_CALLBACK_VERIFIED`, `PAY_DEVICE_ACCEPTANCE`, `PAY_NEXT_DAY_BILL_ACCEPTANCE` attestations. It does not build images, switch traffic or charge money. Release Compose mounts credentials read-only; follow the parent deployment skill/runbook for bypass validation, explicit migrations and rollback.

Before activation: company merchant permissions/app binding, public TLS callbacks, business event delivery, approved small real payment/refund tests, refund deadlines/insufficient funds, key rotation, callback loss/duplication, restart and next-day bills. Channel-funded promotions/actual-payer cash splits are not qualified; only business-side fixed prices are covered. Retries are persistent/bounded but enumerate records; indexed scheduling and load tests are needed before high-volume use. No custody, wallet, teacher payouts or historical personal-transfer fabrication.
