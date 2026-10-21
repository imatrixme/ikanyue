## 1. Gateway foundation

- [x] 1.1 Create standalone Hono/Bun 1.4.1 package, runtime guards, configuration and module ownership documentation.
- [x] 1.2 Add independent PocketBase schema/bootstrap and transactional repository with persistent version claims.
- [x] 1.3 Implement authenticated payment creation/query/closure, ownership, validation and idempotency.
- [x] 1.4 Implement refund reservation, lifecycle and concurrency-safe limits.
- [x] 1.5 Implement durable mock provider observations, payment/refund polling and late-result handling.
- [x] 1.6 Implement durable event delivery/recovery and provider reconciliation with financial read models.
- [x] 1.7 Verify gateway contracts with unit/API tests and real native PocketBase persistence/restart tests.
- [x] 1.8 Add bounded persistent retry scheduling and configured authenticated push with 204 acknowledgement. Indexed enumeration/load qualification remains a production-scale gate.

## 2. Business integration

- [x] 2.1 Add gateway client and versioned business commerce storage without channel credentials.
- [x] 2.2 Implement fixed-price checkout, immutable snapshots and idempotent receipt-to-credit grants.
- [x] 2.3 Implement order-scoped unused-package refund previews, cancellation-tier calculator boundary tests and protected entitlement handling.
- [x] 2.4 Add authenticated student/Admin routes and event recovery worker with ownership and permission tests.
- [x] 2.5 Add API documentation and historical offline provenance guards.
- [x] 2.6 Connect reservation-scoped tiered monetary cancellation, immutable rule publication and user-confirmed fee preview to the booking/credit ledger; verify native failure/liability/retry without credit double return.

## 3. User workflows

- [x] 3.1 Add student catalog, checkout, mock payment, order detail and refund states with human-readable policies.
- [x] 3.2 Add Admin transaction/refund/reconciliation exception views with restricted financial actions.
- [ ] 3.3 Verify component/logic tests, frontend builds and responsive browser/WeChat smoke journeys. Automated tests/builds and desktop/mobile Admin journeys pass; WeChat login is valid but the runtime read timed out, so IDE/device acceptance remains open.

## 4. Native development and release

- [x] 4.1 Add native supervised startup for two PocketBase stores, gateway, business API, Admin and miniapp watcher.
- [x] 4.2 Separate explicit bootstrap/seed from startup; add safe PID ownership, port-conflict and lifecycle checks.
- [x] 4.3 Add release-only gateway image/service configuration with independent data and production mock rejection.
- [x] 4.4 Update startup documentation and scoped architecture decision, preserving Docker volumes and existing production safeguards.
- [x] 4.5 Run full mock purchase/grant/booking/refund/reconciliation smoke and independent service restart recovery.

## 5. Handoff

- [x] 5.1 Run relevant lint/types/tests/builds, strict OpenSpec validation and scoped drift/status review. Remaining workflow/runtime gaps stay open above; this is not production qualification.
- [x] 5.2 Document real WeChat merchant onboarding and live acceptance checklist as an unexecuted release gate; do not enable real charging.

## 6. WeChat protocol with mocked HTTP responses

- [x] 6.1 Implement API v3 request signing, response verification, launch parameters and encrypted notification verification using standard crypto APIs.
- [x] 6.2 Implement JSAPI prepay/query/close, refunds/query and verified bill downloads behind an injected HTTP transport.
- [x] 6.3 Add persistent independent WeChat-shaped mock HTTP state and connect it to gateway recovery and authenticated test controls, without any live transport activation.
- [x] 6.4 Verify signed responses, tampered/stale/duplicate callbacks, identity/amount mismatch, uncertain results, refunds and restart recovery with contract/integration tests.
- [x] 6.5 Switch the native test gateway to WeChat HTTP mock, run the existing commerce journey and document implemented versus unqualified capabilities.

## 7. Operational completion

- [x] 7.1 Add searchable paginated business orders, order details, entitlement/refund timelines, Admin rule-based refunds and immutable actor/reason audit.
- [x] 7.2 Add online offer drafts, explicit versioned publication/withdrawal, price references and user-visible policy snapshots.
- [x] 7.3 Connect reservation cash cancellation quotes, inclusive tiers, atomic entitlement withdrawal and recoverable refund liabilities; expose student confirmation and institution cancellation handling.
- [x] 7.4 Add an operational exception queue with safe recovery, case notes, resolution checks and in-app alert visibility.
- [x] 7.5 Import and parse provider statements, match transactions/refunds and fees, persist differences and resolutions, export safe reports, and distinguish settlement evidence from trade totals.
- [x] 7.6 Add bounded durable retry scheduling and authenticated configured event notification delivery with recovery.
- [x] 7.7 Implement guarded live transport/configuration, credential validation/rotation, prepay renewal, authenticated payer binding and a mock-safe miniapp cashier wrapper. Do not enable real charging locally.
- [x] 7.8 Add release preflight and explicit backup/restore integrity verification tooling; verify both native backups, software/native integration and responsive Admin UI. Preflight rejects the local mock configuration as intended. Actual merchant credentials, full restored-stack rehearsal, approved real transactions and real-device acceptance remain external gates (3.3).
