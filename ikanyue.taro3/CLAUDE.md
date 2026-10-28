# CLAUDE.md

Architecture reference for the 看乐 WeChat mini program. Working rules, verification and boundaries live in `AGENTS.md` (this directory) and the root `AGENTS.md` / `GEB.MD`.

## Overview

Taro 4 + Vue 3 (Options API) + NutUI-Taro mini program for students and teachers. WeChat (`weapp`) is the shipping target; H5 builds are used only for local preview. All data comes from the business API (`kanyue.server`).

## Commands

- `pnpm dev:weapp` — watch build into `dist/` for WeChat devtools
- `pnpm build:weapp` — student-course boundary check → production build → output check
- `pnpm lint` — ESLint over `src utils scripts tests`, zero warnings
- `TZ=Asia/Shanghai pnpm test` — Vitest (`*.test.js` next to the code)
- `pnpm test:tz` — the same unit tests under America/New_York, guarding device-timezone independence
- `pnpm test:e2e` — compiled-output contracts and design-token guards (run after `build:weapp`)
- `pnpm visual:styles` — compiles the inclusive-design style fixture
- `pnpm icons:generate` — regenerates line icons from `assets-src/imagegen/icons-v2`

## Structure

- `src/app.config.js` — pages and tab bar: 首页 / 约课 / 我的 (活动、课程、积分 stay registered but are reached from 我的, not tabs). Teachers reuse the same three slots as 工作台 / 日历 / 我的 via `RoleManager.applyTabBar`; the home and booking pages render the teacher workbench/calendar for teachers.
- `src/pages/<camelCase>/` — `index.vue`, `index.scss`, `index.config.js`, optional `pageLogic.js` (pure logic with tests).
- `src/components/` — shared PascalCase components (`EmptyState`, `AsyncState`, `StickyActionBar`, teacher calendar/booking homes, …).
- `src/styles/` — `_tokens.scss` (imports `_brand.generated.scss`, generated from the root `design-system/brand-tokens.json`), `theme.mjs` (`canvasPageChrome`, `immersivePageChrome`, `themeColors`, `iconSizes`).
- `utils/` (repo root, not `src/`) — `request` (envelope, auth header, clears the session on `AUTH_SESSION_INVALID`), `apis`, `usermanager`, `rolemanager`, `schedulemanager`, `venuemanager` (public venue list, remembered current venue, phone hand-off), `commerce`, `cashier`, `academyTime` (academy clock, UTC+08:00), `commandKeys` (retry-safe idempotency keys).
- `config/` — Taro config; `SERVICE_URL` is `https://mapi.ikanyue.com` in prod and `KANYUE_LOCAL_API_URL` (default `http://127.0.0.1:1437`, the native-stack `kanyue.server`) in dev.
- `scripts/` — build guards (`verify-student-course-boundary.mjs`, weapp output checks), icon generation.
- `tests/e2e/` — Node scripts asserting on `dist/` output.
