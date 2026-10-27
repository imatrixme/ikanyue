# CLAUDE.md

Architecture reference for the ikanyue business API. Working rules, verification and boundaries live in `AGENTS.md` (this directory) and the root `AGENTS.md` / `GEB.MD`.

## Overview

Hono API serving the WeChat mini program, the ops Admin and the public website. PocketBase is the business store; payments are delegated to the separate `kanyue.pay` gateway. The service started as a Sails.js rewrite; the legacy response envelope and login endpoints are kept, but newer domains (course credits, booking, points, commerce, ops) have no Sails counterpart.

## Commands

- `pnpm dev` / `pnpm start` (Node 22); `pnpm dev:bun` / `pnpm start:bun`
- `pnpm lint` — PocketBase-hook guard + ESLint, zero warnings
- `TZ=Asia/Shanghai pnpm test` — Node built-in test runner (`test/**/*.test.js`)
- `pnpm check-docs` — reports missing/outdated `*.js.md` (informational, never fails)
- Schema and workers: `ops:schema:apply`, `course-credits:schema:apply`, `commerce:schema:apply`, `course-bookings:workers`, `commerce:worker`
- Local data: `ops:seed:local`, `course-bookings:seed:local` (normally driven by the root `scripts/native-stack.mjs init`)

## Structure

- `src/app.js` — runtime entry (Node or Bun), response middleware, course-credit storage startup check.
- `src/bonelayer/router.js` → `src/config/router.js` — the only place routes are mounted. Currently registered: public activity find, public course catalog, `user`, `points`, `ops`, `courseCredits`, `commerce`. Directories such as `routes/student`, `routes/teacher`, `routes/audioMaterial`, `routes/videoMaterial` hold legacy handlers that are not mounted.
- `src/utils/routeBuilder.js` — chainable route builder: `routes.post('/v1/user/login').handler(loginHandler)`, `.use(authMiddleware)`, `routes.group(prefix, fn)`.
- `src/middleware` — `response` (`{ code, message, data }` envelope, success code `10000`), `auth` (app JWT → `c.get('user')`), `isTeacher`, `isAdmin`, `opsAuth` (Admin tokens with `scope: ops`).
- `src/services` — domain logic: `courseCredits` (ledger, scheduling, booking under `booking/`), `points`, `commerce` (orders, refunds, gateway client), `ops`, `reports`.
- `src/utils` — `pocketbase` client, `jwtAuth` (env `JWT_SECRET`, expiring tokens), `publicUser` (response redaction + filter escaping), `wechat`, `fileUrl`, mappers.
- `pocketbase/pb_migrations` — versioned business schema migrations.

## Environment

Copy `env.example` to `.env`. Required: `PB_URL`, `PB_EMAIL`, `PB_PASSWORD`, `JWT_SECRET` (≥32 chars, mandatory in production), `PORT` (default 1337). WeChat login needs `WECHAT_APPID` / `WECHAT_SECRET`; booking workers use `COURSE_BOOKING_WORKER_*`; commerce and course-credit features are gated by `COURSE_COMMERCE_*` / `COURSE_CREDIT_*` flags and `PAY_*` gateway settings (see `docs/` and the root native stack config).

## Docs convention

Each documented module has a sibling `*.js.md` with a mermaid diagram, and user routes also carry `*.swagger.json`. Keep those in sync when touching the `.js`; see `AGENTS.md` for when new docs are expected.
