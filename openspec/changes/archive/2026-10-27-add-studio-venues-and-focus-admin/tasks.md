## 1. Admin focus (`ikanyue.admin`)

- [x] 1.1 Regroup `navigation.ts` into five primary groups plus folded 教学 / 账务 / 积分 / 高级设置 under a collapsed "更多"; keep `viewPaths` and legacy paths.
- [x] 1.2 Teacher-only accounts see their groups without folding.
- [x] 1.3 Move booking policies and conflict migration into 高级设置 → 预约规则 (`/schedule/booking-settings`); redirect old `?tab=conflicts` links.
- [x] 1.4 Update tests; run `npm run lint`, `TZ=Asia/Shanghai npm test`, `npm run build`.

## 2. Venues API (`ikanyue.mapi.hono`)

- [x] 2.1 Add the `venues` ops collection (applied by `ops:schema:apply`, like the other ops collections) and seed one default bookable venue.
- [x] 2.2 Add `GET /v1/public/venues` (active, sorted, display fields and bookable flag only) with tests.
- [x] 2.3 Add ops list/create/update/status endpoints with audit records and tests.

## 3. Venues Admin (`ikanyue.admin`)

- [x] 3.1 Add 设置 → 场馆 (list, editor dialog, deactivate/reactivate, sort, bookable flag).

## 4. Venues mini program (`ikanyue.taro3`)

- [x] 4.1 Add a venue page listing active venues; switching stores the venue id locally and returns home.
- [x] 4.2 Home shows the current venue with a "切换场馆" entry; fall back to the first venue when the stored one is gone.
- [x] 4.3 When the current venue is not bookable, home and the booking tab show a phone hand-off instead of booking options.
- [x] 4.4 Remove `src/data/studioInfo.js` and update tests and e2e contracts.

## 5. Verification

- [x] 5.1 Run checks for each touched subproject per the root `AGENTS.md` table.
- [x] 5.2 Run `openspec validate add-studio-venues-and-focus-admin --strict`.
