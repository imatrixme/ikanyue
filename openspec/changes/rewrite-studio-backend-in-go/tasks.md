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

- [ ] 3.1 Enrollment, grant, accounts, batch extend/restore, learning views.
- [ ] 3.2 Credit expiry and reconciliation as in-process jobs; ledger parity check against Hono on a data copy.

## 4. Booking

- [ ] 4.1 Policies, offerings, availability and overrides.
- [ ] 4.2 Student, teacher and ops appointments, conflicts; expire/fulfill jobs.

## 5. Sessions and settlement

- [ ] 5.1 Classes, sessions, publish/cancel/reschedule, calendars and schedules.
- [ ] 5.2 Attendance, settlement, reverse settlement; parity check against Hono.

## 6. Commerce

- [ ] 6.1 Student commerce, ops commerce, payment-event callback, recovery job.
- [ ] 6.2 Mock payment end-to-end smoke (`scripts/commerce-smoke.mjs`).

## 7. Admin console (`kanyue.server/ui`)

- [ ] 7.1 Svelte + Vite scaffold, token generation target, embedded serving, login.
- [ ] 7.2 Pages per migrated module (today, students, booking, billing, settings, advanced).
- [ ] 7.3 Switch the admin domain to the embedded console; old React admin keeps only out-of-scope pages.

## 8. Wrap-up

- [ ] 8.1 Remove migrated Hono code, `pb_migrations`, `ops:schema:apply`; update `GEB.MD` §8, root `AGENTS.md`, README, technical design §5.1.
- [ ] 8.2 Run checks per subproject; `openspec validate rewrite-studio-backend-in-go --strict`.
