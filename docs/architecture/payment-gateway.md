# Payment Gateway Decision and Verification

Status: operational implementation on `feature/payment-gateway-commerce`, OpenSpec `add-payment-gateway-commerce`. Local mode remains `wechatpay-mock`. No production deployment, image build, real charging or Git commit occurred in this operational-completion pass.

## Ownership

`kanyue.pay` is standalone Hono/Bun 1.4.1 with independent lockfile/PocketBase. The root temporarily tracks it because no separate remote was supplied. Existing subprojects retain independent repositories; no root JS workspace.

Business Hono owns immutable offer/order price/policy snapshots, eligibility, credits and cancellation rules. Gateway owns provider protocol/credentials, money identity, reserved refund principal, receipt events, retries and cash reconciliation. Admin/Taro call Hono only. Personal/offline transfers never become gateway receipts.

## Operational Workflows

Admin's **收款与退款** provides paginated learner-first orders/details, quoted package refunds with actor/reason audit, immutable offer publication, case notes/recovery/resolution, exhausted-task alerts, statement matching/export and separate bank evidence. Institution-refund actions require finance capability; authorized teachers can cancel their own teaching commitment.

Cash cancellation allocates the original discounted paid value to the reserved unit. Server reception time selects an inclusive tier; students confirm fee/refund and stale quotes fail. One PB transaction cancels the appointment, retires the reserved unit and creates a refund liability/audit. The unit is not also returned as reusable credit. Definite cash-refund failure retains the liability; a new attempt requires definitive failure and operator audit. Institution cancellation has no fee. Legacy batches retain credit-release rules even when commerce is disabled.

Remaining-package refund provisionally withdraws available units; definitive failure restores available/expired balances. Reserved courses block package refunds. Cumulative refunds cannot exceed captured principal; fees do not create negative refunds. Published terms cannot change historical orders.

Gateway recovery has persistent leases, backoff, a bounded failed-attempt budget and audited reset. Configured authenticated pushes require HTTP 204; pull/ack remains. Business receivers re-query gateway truth before fulfillment. Transport uncertainty does not prove failure or success.

WeChat signing, encrypted callback verification, prepay renewal, payer binding, protected live credential loading and allowlisted transport are implemented. Mock/real cashier actions are distinct. Live activation remains guarded and unexecuted. Platform-key rotation uses explicit file deployment/restart with overlapping pinned keys.

Official ALL bills retain hashes/provenance, normalized rows, fees, mismatches and audited resolution. Reverse matching detects absent captured payments/refunds with known channel acceptance dates. Exports escape spreadsheet formulas. Bank receipt hashes are finance attestations, not automatic bank integration or tax compliance. See [gateway contracts and release commands](../../kanyue.pay/README.md).

## Environment and Release

Native ports: Admin 18180, Hono 1437, gateway 1440, business PB 18190, payment PB 18192; loopback only. Ignored `.local/native/environment.json` is mode 0600. Explicit `test init` is separate from ordinary start/restart. Docker data remains untouched. Watcher startup/build and device acceptance are separate.

Explicitly apply business commerce schema (offer version/audit/cases), money-precision upgrade and additive gateway entity kinds before rollout, backing up both stores first. Startup verifies rather than migrates. Release-only Compose uses read-only credentials and immutable images. Preflight checks configuration, external attestations, clean revisions and recent hashed backup reports, not live activation.

Both native stores were backed up through PB, extracted into fresh directories, verified with read-only SQLite integrity/count queries and hashed. Active data was never restored/overwritten. Durable off-host retention and a full bypass-stack restore/start rehearsal remain release duties. Roll back app/routing while retaining financial writes and compatible workers; database rollback requires separate approval.

## Evidence and Remaining Acceptance

- Tests cover tier boundaries, ownership/capabilities, actor provenance, atomic credit retirement/refund liabilities, failure recovery, authenticated event delivery, safe exports, signed protocol faults and isolated PB process restart.
- Native tiered smoke: 800 yuan/four units, one cancellation with 100 yuan fee plus 100 yuan refund, failed-refund retry, remaining 600 yuan refund and gateway restart. Final captured 800 / refunded 700 / fee 100 / available units zero. Test records retained.
- Admin desktop/mobile browser evidence covers order details and bill import/details; component tests separately cover refund confirmation/recoverable errors. Builds/lint are separate from runtime acceptance.
- Browser acceptance additionally saved an unpublished test offer, saved/resolved a verified test exception (open count 11 to 10), and exported the persisted bill report. Screenshots are under ignored `output/playwright/payment-*`; native records are retained.
- Automated totals: gateway 32 passing (185 assertions, isolated PB restarts), business 543 passing / 4 opt-in skips, Admin 156 passing, miniapp 110 passing, native launcher 3 passing. Gateway types, all three app lints, Admin client/SSR and miniapp builds plus compiled contracts pass. Admin bundle-size and Node deprecation warnings remain.
- WeChat login was confirmed (`loginExpired:false`) after user login. The runtime read returned `Error: timeout waiting for automator response`; further IDE automation paused under the skill. Compilation is not runtime/device acceptance.
- Merchant acceptance, real device cashier/transactions, next-day official bills, key-rotation rehearsal, insufficient-funds/refund-window handling and public callback verification remain unexecuted.
- Channel-funded promotions/actual-cash splits, external messaging alerts, bank feeds and indexed high-volume scheduling are outside this implementation. Persistent retries still enumerate records. Old receipts lacking acceptance times need evidence review. Neither docs nor preflight flags certify payment compliance.

## Drift

DRIFT FOUND:
- Location: business money schema and generated migration.
- Code says: exact fen allocations become decimal yuan at the business persistence boundary.
- Docs say: original-paid-value refunds include cent-level allocations.
- Tests say: generated migration matches schema.
- Likely source of truth: exact money calculation and explicit decimal persistence.
- Risk: old integer-only fields reject proportional refunds.
- Proposed fix: decimal schema/initial migration plus explicit upgrade migration added; production migration not executed.

DRIFT FOUND:
- Location: earlier gateway README/OpenSpec progress versus approved target.
- Code says: tiered cash cancellation, publication, bounded retries, configured push and statement matching are connected.
- Docs say: the prior mock milestone described them as absent.
- Tests say: native cancellation/failure/retry and work/statement contracts now cover them.
- Likely source of truth: current implementation with external live gates still open.
- Risk: stale text hides operator workflows or misstates qualification.
- Proposed fix: updated scoped docs/tasks; do not archive while WeChat runtime acceptance remains open.

DRIFT FOUND:
- Location: student cancellation preview and appointment projection.
- Code says: the first integration depended on commerce flag and excluded rescheduled appointments.
- Docs say: legacy cancellation remains independent of purchasing.
- Tests say: legacy preview needs no commerce collection; ownership is enforced.
- Likely source of truth: compatibility and cancellation service eligibility.
- Risk: commerce-off or rescheduling hides a valid cancellation.
- Proposed fix: booking-owned preview endpoint, rescheduled cancellation action, API docs and regression coverage.
