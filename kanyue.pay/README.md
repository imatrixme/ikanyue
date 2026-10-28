# kanyue.pay

Standalone Go gateway: one binary with an embedded PocketBase v0.32.0 (`pay_entities`). Business orders, prices, refund rules and credits belong to kanyue.server. The PB dashboard at `/_/` is the read-only data panel for operators; money changes go only through the gateway API.

## Local Development

From the parent, `node scripts/native-stack.mjs init` then `up` starts the API gateway (kanyue.gateway), kanyue.server, this payment gateway (service name `pay`) and the miniapp watcher; ordinary startup never migrates or seeds.

Standalone (Go module, independent of the server module):

```sh
go run . migrate up --dir=./pb_data       # explicit, once per schema change
go run . superuser upsert EMAIL PASS --dir=./pb_data   # dashboard login
PAY_PROVIDER=wechatpay-mock PAY_SERVICE_TOKEN=... go run . serve --http=127.0.0.1:1340 --dir=./pb_data
```

`serve` refuses to start with pending migrations. Existing TS-era data is adopted in place: `migrate up` widens the legacy `pay_entities` kinds; the unused `pay_claims` collection is left untouched.

Checks (single-threaded): `GOMAXPROCS=1 go vet -p 1 ./...`, `GOMAXPROCS=1 TZ=Asia/Shanghai go test -p 1 -parallel 1 ./...`. Tests use an in-memory store and real temporary PocketBase directories (restart, atomicity, legacy adoption). Parent `node scripts/commerce-smoke.mjs --tiered` exercises the full purchase/refund path through a gateway restart.

## Operator Entry

Use Admin's **收款与退款** for every action; the PB dashboard is for inspection only:

- **订单管理**: search learner name/phone/course/order, filter status/China dates, inspect credits and actor audit, refund the server-quoted unused balance with reason and confirmation.
- **课程商品**: reference a package/price version, draft deadline tiers, publish explicitly or withdraw. Published rules are immutable; changes need a new version.
- **待处理异常**: unresolved money/fulfillment states, case notes, trusted recovery, verified resolution and exhausted-task reset/audit. Alerts are in-app, not external messaging.
- **账单与到账**: download/import an ALL trade bill, inspect matching/missing transactions and fees, export a formula-safe report, register finance-attested bank receipts separately. Finance retains original receipts; the system stores hashes.

Frontend calls kanyue.server with user authorization. No gateway token, merchant key or PB superuser credential enters browser/miniapp bundles.

## Gateway Contract

All `/v1/*` routes require `Bearer PAY_SERVICE_TOKEN` and configured-owner scope. Payment/refund creation requires `Idempotency-Key` (1-120 identifier characters). Amounts are positive integer CNY fen.

- `POST /v1/payments`: `{reference,amount,currency:"CNY",payerId,description}`. Authenticated kanyue.server supplies the WeChat payer.
- `GET /v1/payments/:id`, `POST /v1/payments/:id/close`, `POST /v1/payments/:id/refresh`.
- `POST /v1/refunds`: `{reference,paymentId,amount}`; `GET /v1/refunds/:id`. Pending refunds reserve principal atomically.
- `GET /v1/events`, `POST /v1/events/:id/ack`: durable at-least-once pull/ack. Configured `PAY_EVENT_URL` and distinct `PAY_EVENT_TOKEN` enable bounded push. Only HTTP 204 acknowledges delivery. kanyue.server `/internal/commerce/payment-events` reloads trusted results before acknowledging.
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

`kanyue-pay maintenance backup payment|business` asks the embedded pay PB (`PAY_PB_URL`, `PAY_PB_EMAIL`, `PAY_PB_PASSWORD`: a pay superuser) or kanyue.server (`PB_URL`, `PB_EMAIL`, `PB_PASSWORD`) for a backup over loopback or HTTPS, downloads it, extracts into a fresh temporary directory, checks read-only SQLite integrity/counts and writes a restrictive SHA-256 report. It retains server backups and never overwrites active data. Archive ZIP/report into approved durable off-host storage; temporary paths are not retention policy. This verifies extraction/data integrity, not a full restored-stack process rehearsal.

`kanyue-pay maintenance preflight` requires valid live credentials, immutable image digest, clean root/subproject worktrees, recent matching backup reports (`PAY_BACKUP_REPORT`, `BUSINESS_BACKUP_REPORT`), and explicit `PAY_CALLBACK_VERIFIED`, `PAY_DEVICE_ACCEPTANCE`, `PAY_NEXT_DAY_BILL_ACCEPTANCE` attestations. It does not build images, switch traffic or charge money. Release Compose mounts credentials read-only; follow the parent deployment skill/runbook for bypass validation, explicit `kanyue-pay migrate up` and rollback.

Before activation: company merchant permissions/app binding, public TLS callbacks, business event delivery, approved small real payment/refund tests, refund deadlines/insufficient funds, key rotation, callback loss/duplication, restart and next-day bills. Channel-funded promotions/actual-payer cash splits are not qualified; only business-side fixed prices are covered. Retries are persistent/bounded but enumerate records; indexed scheduling and load tests are needed before high-volume use. No custody, wallet, teacher payouts or historical personal-transfer fabrication.
