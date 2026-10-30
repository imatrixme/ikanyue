## 1. Data model

- [x] 1.1 Migration `kanyue_0007_tenants`: `tenants` collection (name, kind `studio`/`individual`/`coach`, nullable `parent`, status, multi-select `joinMethods` `scan_join`/`scan_approval`/`staff_invite`), seeded with the 看乐 default tenant (`staff_invite`).
- [x] 1.2 Required `tenant` relation on every business collection, backfilled to the default tenant; platform-level collections listed in design.md stay without it.
- [x] 1.3 Rebuild business unique indexes as `(tenant, …)`; keep idempotency keys, order/operation numbers, provider event ids and auth fields globally unique.
- [x] 1.4 `tenant_plugins` collection (tenant, plugin, status, enabledAt) with `payment` enabled for the default tenant.
- [x] 1.5 Migrations stay up-only (project rule): rollback restores the `pb_data` backup. Migration tests cover up, idempotent re-runs, the backfill and per-tenant uniqueness.

## 2. Tenant-scoped access

- [x] 2.1 Tenant-scoped `core.App` (`internal/tenancy`): wraps filters with the tenant, treats other tenants' ids as not found, writes `tenant` server-side, scopes transactions.
- [x] 2.2 Request tenant resolver, fixed to the default tenant in this phase; scheduled jobs iterate active tenants.
- [x] 2.3 `records.Page` and `coursecredit/store.go` run on the request's scoped app unchanged.
- [x] 2.4 Business routes get the scoped app through `e.App`; code that held the unscoped app (commerce, scheduled jobs) now uses the request or job scope.
- [x] 2.5 Plugin gate: payment routes (checkout, orders, refunds, reconciliation, pay gateway callbacks) answer 404 unless the deployment enables commerce and the request tenant has `payment` enabled; the gate is declared once as `Plugin` on the commerce module. Commerce still shares the `coursecredit` package with the core ledger, so "core never depends on plugin code" is kept by convention, not yet by package boundary.
- [x] 2.6 Static guard: business packages may not call PocketBase record queries or saves directly; migrations, devseed, testkit and platform code are allowlisted.

## 3. Verification

- [x] 3.1 `testkit` builds two tenants; isolation tests cover the scoped app (list, detail, write, delete, transactions), the renewal scan and routes across two tenants, and a tenant without `payment` getting 404 from plugin routes while core routes work.
- [x] 3.2 `gofmt -l .`, `GOMAXPROCS=1 go vet -p 1 ./...`, `GOMAXPROCS=1 TZ=Asia/Shanghai go test -p 1 -parallel 1 ./...`.
- [ ] 3.3 Contract tests through the local gateway (TEST/PRE/RELEASE) and the commerce smoke pass unchanged (done); the mini program live flows remain to be run in WeChat DevTools. (2026-10-29: `pnpm test:live` passes 11/11 through the local gateway in TEST after the order/payment split; in the DevTools simulator the course shop renders both with selling on and with the platform payment pause on (paused notice, orders still listed), and an order opens while paused. The other flows in DevTools and on a phone are still open.)
- [ ] 3.4 Rehearse the migration and the backup restore on a copy of production `pb_data` before the release (timing agreed with the founder).
