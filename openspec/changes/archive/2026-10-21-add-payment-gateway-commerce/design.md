## Context

See proposal.md. The root contains independently managed subprojects, not a JS workspace. Business PocketBase already stores immutable course batches, operation version claims and transactional batches. Existing Admin enrollment can register offline payments directly; it is not proof of provider settlement. The unified test launcher builds Docker images by default, while the older native launcher omits newer course schemas. Existing frontend terminology edits must be preserved.

## Goals / Non-Goals

**Goals:** A persistent mock gateway and business commerce workflow that exercise real APIs and separate stores; channel-neutral service contracts; resumable jobs, traceable money and native development. Pin the gateway to Hono and Bun 1.4.1 with PocketBase SDK persistence. Keep source files below 500 lines.

**Non-Goals:** Fund custody, wallets, payment aggregation for other companies, teacher payouts, automatic tax accounting, historical personal-transfer reclassification, Alipay implementation or live WeChat activation without merchant approval. Do not invent a remote repository or commit existing work.

## Decisions

### Service and data ownership

`kanyue.pay` owns a separate package, lockfile, process and PocketBase database. It never imports business source or reads business collections. The business API owns course pricing, cancellation/refund eligibility and ledger changes. The gateway receives integer minor-unit amounts, currency, an opaque business reference and a stable idempotency key, and returns gateway identifiers and channel-specific launch actions. A business order and its payment/refund attempts are distinct records.

Gateway scope includes payment/refund execution, provider queries, closure, durable jobs, outbound events and reconciliation records. Business scope includes immutable price/policy snapshots, order ownership, grants and refund entitlement locking. Financial reports distinguish cash receipt/refund/fees/settlement from course delivery and historical offline sources.

### Persistent concurrency and recovery

Use PocketBase transactional batches plus unique operation/version claims for compare-and-swap transitions. Each committed transition appends an immutable event in the same batch. Retried requests compare fingerprints and return the original result; conflicting payloads fail. Provider operations use stable identifiers, allowing replay after network uncertainty. A worker scans durable pending work with bounded retries; in-memory timers only wake the worker. Optimistic version conflicts prevent concurrent refund overspending.

Cross-service delivery is at least once, not a distributed transaction. The gateway provides authenticated event listing/acknowledgement for a durable business consumer and supports authenticated notifications through a configured destination, never a request-supplied arbitrary URL. Consumer inbox uniqueness plus transactional grants prevent duplicate credit. Unknown transport results remain pending and are queried, never treated as payment failure. Paid-but-unfulfilled orders remain recoverable.

### Security and provider contract

Initial internal APIs use scoped server credentials over TLS outside loopback, timing-safe validation, bounded payloads, validated identifiers and sanitized errors. Never expose credentials to Taro/Admin or store them in tracked files. Payment amount/currency/merchant/reference must match when accepting results. Refund reservations include pending amounts, and release only on definitive failure. Production rejects mock, weak/missing credentials and unsupported real adapters. Do not implement cryptography from scratch.

Mock owns its own durable provider observations instead of editing business orders. Authenticated test controls can trigger success/failure, late success, duplicate observations and refunds. Event recovery and financial reconciliation use these independent provider observations. Mock controls are absent outside explicit development/test modes. Real WeChat protocol qualification and native payment invocation are a later release gate, not satisfied by mock coverage.

### Commerce and refunds

Checkout takes a catalog choice, not client-supplied money. Snapshot quantities, actual minor-unit allocation and cancellation tiers; prices cannot be renegotiated through ordinary checkout. New sales do not reuse Admin's manual paid flag. Reuse the exact-course grant service after a trusted gateway payment result.

Tier rules apply to a specific reservation and use server receipt time with unambiguous threshold equality; merchant cancellation and statutory exceptions remain distinct. Package refund calculations use the original order's paid allocation, settled usage, earlier/pending refunds and protected scheduled credits. Do not introduce fractional course credits to represent money deductions. Tier settings stay draft until explicitly published; test fixtures are not legal policy. General unused-package refund preserves paid unit cost; repricing/gifts need explicit rules and cannot create debt. Frozen refund entitlements cannot be booked or settled concurrently. Historical offline orders cannot call gateway refund.

### Developer and release workflow

Extend the existing root shell entrypoint without root npm dependencies. Native mode runs two PocketBase instances, business Hono, Bun gateway, Vite and Taro watcher with separate data/PID/log paths. Bootstrap is explicit and ordered; startup only checks readiness/schema. Stop only validated owned processes, never kill by port. Preserve existing Docker volumes; any import uses explicit backup/restore. Default local services bind loopback; real-device LAN exposure is opt-in. Release packaging remains Docker with immutable runtime versions, dedicated volumes and mock forbidden.

## Risks / Trade-offs

- Independent services add eventual consistency -> durable events/inbox, idempotency and restart/duplicate tests.
- PocketBase has no arbitrary HTTP compare-and-swap -> transactional unique version claims and retry after re-read; verify against real native PB.
- Mock can conceal channel errors -> separate documented merchant/live payment/refund/statement gate.
- Current personal receipts lack company proof -> preserve provenance; no automatic cash migration.
- Unspecified cancellation tiers -> publish only explicit policy, never silently adopt illustrative penalties.
- New repository remote is not supplied -> keep a standalone package in the parent working tree initially; no dangling gitlink or invented remote. Separate remote registration can follow an explicit remote choice.

## Approved follow-up: WeChat protocol, mocked transport

Implement ordinary-merchant API v3 using an injected HTTP transport. The adapter signs requests, verifies raw response bytes against pinned public-key IDs, produces small-program launch signatures and verifies/decrypts notifications with standard RSA/AES-GCM APIs. Development selects `wechatpay-mock`: an independent persistent mock HTTP peer verifies merchant requests, returns WeChat wire schemas and signs responses/notifications with generated test keys. No real network transport is wired into runtime. Production and `wechatpay` remain rejected.

Persist channel identity on new payments so existing generic mock records are never replayed into WeChat. Gateway IDs, not potentially overlong business references, become merchant trade/refund numbers. Unknown responses remain pending; REFUND.ABNORMAL remains reserved rather than being treated as a definitive failure. Verify merchant, app, payer, currency, reference and amounts before applying receipts. Mock credentials are ephemeral process-local test material, not real merchant keys. Mock launch parameters must never invoke the real WeChat cashier. Bill download includes signed metadata, strict download-origin/path allowlisting and content hash verification; full channel statement import/financial matching remains a separate qualification step.

## Migration Plan

### Approved operational completion

Admin is the only business operations console; PocketBase is not a refund tool. Order views start from business orders (including those without a payment ID), search human identities and use stable pagination. Normal staff refunds use exactly the learner's quote, require a reason and record authenticated actor identity. Privileged institution handling waives cancellation fees but never refunds consumed teaching automatically or exceeds remaining principal. No editable arbitrary ordinary-sale prices/refund amounts are introduced.

Published offers reference existing price versions and store immutable policy versions. Drafts cannot be purchased. A cash reservation cancellation retires the reserved whole lesson credit and refunds that lesson's original paid allocation minus its published tier fee; it must not both refund cash and release a reusable lesson. Legacy offers retain credit-return cancellation. Financial cancellation and booking release must commit together; a failed cash refund remains a liability requiring retry, not a reopened appointment. Refund requests use server receipt time and confirmed amounts. Teacher/institution cancellation waives the fee.

Exception workspaces expose unresolved fulfillment/refund/statement work, not editable payment states. Retry preserves idempotency; resolution requires checked evidence and an audit note. Provider statement imports preserve verified hashes, exact minor-unit values and differences; exports neutralize spreadsheet formulas. Transaction bills do not prove bank settlement. Live configuration requires explicit gates and never auto-falls back to mock; test cashier actions cannot call real WeChat APIs. External merchant/live acceptance remains separate from implementation completion.

1. Create the same feature branch in root and affected existing subprojects without committing dirty work.
2. Complete and validate this change's artifacts, then implement gateway tests/storage/API before consumers.
3. Bootstrap isolated native test stores explicitly and exercise mock purchase, grant, reservation, cancellation, refund and reconciliation.
4. Preserve old offline records and existing course contracts. Gate new commerce and live provider activation independently.
5. Build release images only in the release stage. Before activation back up both databases and verify payment notifications, refund callbacks, restart recovery and next-day statements with approved small real transactions.
6. Roll back application traffic/features without deleting payment records, events or pending liabilities; keep a compatible recovery worker running.
