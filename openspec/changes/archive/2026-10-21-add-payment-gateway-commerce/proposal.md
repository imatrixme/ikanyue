## Why

Kanyue currently records offline enrollment payments but has no verifiable online purchase/refund lifecycle. A separately deployable payment gateway lets the company move from historical personal transfers to standardized company sales without coupling course rules to WeChat, future Alipay integrations, or payment reconciliation.

## What Changes

- Create `kanyue.pay`, an independent Hono service pinned to Bun 1.4.1, with its own PocketBase instance, credentials, schema, durable payment/refund records, jobs, event delivery and reconciliation.
- Implement an authenticated versioned gateway contract and a persistent mock provider for end-to-end development before merchant approval. Production rejects mock and unconfigured real providers.
- Add standardized self-service course purchases, immutable prices and cancellation tiers, order-scoped refund calculation, entitlement protection and idempotent payment-event consumption to the business backend.
- Add student purchase/order/refund views and Admin payment/refund/exception visibility without changing teacher settlement ownership.
- Replace Docker-first local testing with supervised native processes; initialize data explicitly, preserve existing Docker volumes, and reserve image builds for release validation.
- Preserve historical personal transfers as offline-origin records, never fabricated gateway receipts.

## Capabilities

### New Capabilities
- `independent-payment-gateway`: Payment/refund execution, event delivery, polling, mock scenarios, money reconciliation and provider isolation.
- `course-commerce`: Fixed-price checkout, paid entitlement grants, cancellation/refund policy snapshots and student/Admin transaction workflows.
- `native-development-stack`: Native local startup, independent business/payment storage, explicit bootstrap and Docker-only release packaging.

### Modified Capabilities

None. Existing course/booking changes remain the source for entitlement and scheduling contracts; this adds a commerce boundary without replacing their ledgers.

## Impact

- Root: OpenSpec, scoped architecture decision, startup/release scripts and documentation; no root JavaScript workspace or dependencies.
- New `kanyue.pay`: Hono, Bun 1.4.1, PocketBase SDK, independent package/lockfile and tests.
- `ikanyue.mapi.hono`: Gateway client, authenticated events, commerce services/routes/schema and tests.
- `ikanyue.admin`, `ikanyue.taro3`: Human-readable transaction workflows and tests, preserving existing uncommitted terminology work.
- No Flutter/website changes, commits, remote repository creation, real financial transactions or automatic migration of personal receipts. Real WeChat activation requires merchant credentials and a separate live acceptance gate.
