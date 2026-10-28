## 0. Spike (`kanyue.server`)

- [x] 0.1 Go module embedding PocketBase v0.32.0 opens a copy of the local business `pb_data` without schema changes.
- [x] 0.2 `GET /v1/public/venues` served by Go matches Hono's response for the same data.
- [x] 0.3 JWT interop: Go accepts Hono-issued app and ops tokens, rejects challenge tokens, and Hono accepts Go-issued tokens.
- [x] 0.4 Unowned routes are reverse-proxied to Hono with method, path, query, headers and body intact.
- [x] 0.5 `/api/*` and `/_/` are rejected for proxied/public requests and allowed for internal requests.
- [x] 0.6 `RunInTransaction` rolls back multi-collection writes on failure (Go test).
- [x] 0.7 Record results in `design.md` → Spike 结果; decide go/no-go for stage 1.

## 1. Foundation

- [x] 1.1 Server skeleton: config, envelope helpers, JWT, auth middlewares, module ownership registry with `KANYUE_HONO_MODULES` fallback.
- [x] 1.2 Contract test harness (`kanyue.server/contract`) runnable against Hono and Go via `BASE_URL`.
- [x] 1.3 `migrate up` command with idempotent Go migrations for existing collections; `serve` refuses to start while one is pending.
- [x] 1.4 Native stack and `compose.yaml` run `kanyue.server` in place of the business PocketBase; Hono `PB_URL` points to it.
- [x] 1.5 Migrate venues, public course catalog and identity endpoints with contract tests.

## 2. Students and catalog

- [x] 2.1 Students, follow-ups.
- [x] 2.2 Course specs, credit types, packages, price versions, package grant lines.

## 3. Enrollment and credit ledger

- [x] 3.1 Enrollment, grant, accounts, batch extend/restore, learning views.
- [x] 3.2 Credit expiry and reconciliation as in-process jobs; ledger parity check against Hono on a data copy.

## 4. Booking

- [x] 4.1 Policies, offerings, availability and overrides.
- [x] 4.2 Student, teacher and ops appointments, conflicts; expire/fulfill jobs.

## 5. Sessions and settlement

- [x] 5.1 Classes, sessions, publish/cancel/reschedule, calendars and schedules.
- [x] 5.2 Attendance, settlement, reverse settlement; parity check against Hono.

## 6. Commerce

- [x] 6.1 Student commerce, ops commerce, payment-event callback, recovery job.
- [x] 6.2 Mock payment end-to-end smoke (`scripts/commerce-smoke.mjs`).

## 7. Remaining modules

- [x] 7.1 Baseline schema migration: empty `pb_data` + `migrate up` creates every collection; existing databases are untouched.
- [x] 7.2 Activities list, points and reward items (mini program and ops, including reward image upload).
- [x] 7.3 Conversion rule management, teacher events and confirmation.
- [x] 7.4 Booking backfill preview/apply.
- [x] 7.5 Legacy migration inventory/preview/apply and shadow preview.
- [x] 7.6 Remove the Hono proxy and `KANYUE_HONO_MODULES`; unowned routes return 404.

## 8. Payment gateway (`kanyue.pay` in Go)

- [x] 8.1 Go module embedding PocketBase with the pay schema as Go migrations; same HTTP contract as the TypeScript gateway.
- [x] 8.2 Mock and WeChat channels, statements, recovery; port the TypeScript tests.
- [x] 8.3 `scripts/commerce-smoke.mjs` passes against the Go gateway.

## 9. Admin console

- [x] 9.1 Build `ikanyue.admin` as a static SPA without SSR; embed it in `kanyue.server` and serve it on the same origin as `/ops`.

## 10. Wrap-up

- [x] 10.1 Delete `ikanyue.mapi.hono`; compose and native stack run only `server` and `pay`.
- [x] 10.2 Update `GEB.MD` §8, root `AGENTS.md`, README, technical design §5.1.
- [x] 10.3 Run checks per subproject; `openspec validate rewrite-studio-backend-in-go --strict`.
