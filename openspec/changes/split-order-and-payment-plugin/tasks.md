## 1. Tests first

- [x] 1.1 Split the existing commerce tests into order center cases and payment plugin cases, keeping every assertion.
- [x] 1.2 Add plugin lifecycle cases: after expiry a student can still see orders, request a refund that gets executed, and callbacks still land, but the offer list, checkout and cashier answer 404; after disabling, pending online refund requests turn offline. Add an amount-mismatch case: no fulfilment, a money exception is recorded.
- [x] 1.3 Static guards: core packages do not import `internal/plugins/...`; the payment plugin does not name core collections.

## 2. Data

- [x] 2.1 Migration `kanyue_0008_order_payment_split`: rename `commerce_offers` to `offers`; extend `orders`; create `order_refunds`, `payment_transactions`, `refund_transactions`; rename `commerce_cases`/`commerce_claims`/`commerce_audit` to `payment_*`; convert existing `commerce_orders`/`commerce_refunds` rows; drop the emptied collections; add `expiresAt` and `winding_down` to `tenant_plugins`.
- [x] 2.2 Register the new collections in `tenancy.Collections`; migration tests cover conversion and idempotent re-runs.

## 3. Order center (core)

- [x] 3.1 Order center in `coursecredit`: offers, placing orders, order queries, refund preview and requests, fulfilment and re-fulfilment, owning the student and ops routes listed in design.md §2.
- [x] 3.2 Appointment cancellation preview and command read order center data and create refund requests; no payment data is touched.
- [x] 3.3 Offers administration moves to the core catalog with unchanged routes.
- [x] 3.4 Commands exported to the payment plugin: `PayableOrder`, `OrderPaid`, `OrderPaymentFailed`, `OnlineRefunds`, `RefundOf`, `RefundSucceeded`, `RefundFailed`, `ReopenRefund`, `OrderSummaries` and the order views; idempotent and transactional.

## 4. Payment plugin

- [x] 4.1 New package `internal/plugins/payment`, money only: gateway client, payment and refund transactions, cashier, payment result query, callbacks, refund executor, recovery job, finance overview, statements passthrough, money exception cases.
- [x] 4.2 Routes declare the plugin capability they need (start payment / money wind-down / none); `main.go` registers the plugin module.
- [x] 4.3 Remove the old `commerce_*` files from `coursecredit`.

## 5. Plugin lifecycle

- [x] 5.1 `tenancy`: effective plugin state from `status` and `expiresAt`; route middleware `tenancy.Needs` hides routes whose declared capability the current state lacks; payment jobs run while active or winding down.
- [x] 5.2 Disabling the payment plugin is refused while online refunds are processing (they may be at the gateway); otherwise failed online reservation refunds, still owed, turn offline.

## 6. Platform pause and gateway

- [x] 6.1 `platform_plugins` with `paused`: while paused no tenant has the start-payment capability; settling money is unaffected.
- [x] 6.2 Gateway exposure: cashier and payment result routes in their own batch with policy set `payment`; test and README updated.

- [x] 6.3 Recovery opens the payment of new orders so the gateway window runs from checkout; orders past the window without a payment are closed (recovery, cashier, disabling).
- [x] 6.4 Refund settlement is checked again when the refund request is written, so it cannot race a disable.
- [x] 6.5 Mini program: a paused shop still lists orders and refunds; the cashier explains paused payment. Admin: payment pages explain that online payment is off instead of "接口不存在".

## 7. Verification

- [x] 7.1 `gofmt -l .`, `GOMAXPROCS=1 go vet -p 1 ./...`, `GOMAXPROCS=1 TZ=Asia/Shanghai go test -p 1 -parallel 1 ./...`.
- [x] 7.2 Contract tests against the local server (29 pass, 6 skipped without `COMPARE_URL`), `node scripts/commerce-smoke.mjs` and `--tiered` (reading the new collections) and `node --test scripts/gateway-exposure.test.mjs` pass.
- [ ] 7.3 Run the contract tests through gateway TEST/PRE/RELEASE after creating the `payment` policy set and applying the exposure plan.
- [ ] 7.4 Rehearse the migration on a copy of production `pb_data` before the release (timing agreed with the founder).
