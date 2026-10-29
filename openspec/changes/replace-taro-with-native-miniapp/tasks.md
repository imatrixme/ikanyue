## 1. Skeleton and kit

- [x] 1.1 Create `ikanyue.mini` (project config, `app.*`, dev-only `package.json`, ESLint, Vitest).
- [x] 1.2 `kit/host.js`, `kit/env.js`, `kit/api.js` with tests against a fake host.
- [x] 1.3 `kit/page.js` (`definePage`) and `kit/component.js` (`defineComponent`) with tests: minimal `setData`, computed, `onField`, pull-down refresh, error toast.
- [x] 1.4 Guards: `wx.` only inside `kit/`; `core/` never imports `kit/`.

## 2. Logic and services

- [x] 2.1 Move pure logic (`pageLogic`, `academyTime`, data files) into `core/` with their tests.
- [x] 2.2 Move `request`, `apis`, `usermanager`, `rolemanager`, `schedulemanager`, `venuemanager`, `commerce`, `cashier`, `commandKeys` (needs storage) into `services/` on top of `kit/api`; tests pass.

## 3. Styles and base components

- [x] 3.1 Design tokens in rpx for `ikanyue.mini` from `scripts/sync-design-tokens.mjs`; page JSON colors checked by `scripts/check-design-system.mjs`.
- [x] 3.2 Own `k-button` and `k-popup`; shared components ported.

## 4. Pages

Each page and component passes `tests/views.test.js` (portable WXML, handlers exist, tags registered); behaviour on a device is 5.3.

- [x] 4.1 Home (student and teacher workbench).
- [x] 4.2 Booking tab (appointment booking, slots, appointments, detail, teacher calendar and availability).
- [x] 4.3 Profile tab (profile, userinfo, agreement, venues).
- [x] 4.4 Courses (courses, course detail, shop, order, lessons, lesson detail, records, teacher lesson detail).
- [x] 4.5 Activities and points (activity, activity detail, points, points history, reward catalog, image detail, webview).

## 5. Verification and cutover

- [x] 5.1 Static source checks replacing `tests/e2e` and `verify-student-course-boundary` (`tests/source.test.js`: app shell and page chrome, no credentials or test endpoints, no runtime logging, token-only styles, student course and booking boundary; `tests/contracts.test.js`: role-aware schedule contracts).
- [ ] 5.2 Lint, unit tests, WeChat DevTools compile; package size recorded. Lint, tests and the DevTools simulator compile pass; all 25 pages open without errors (DevTools also compiles `_*.scss` partials standalone, so each partial imports the tokens it uses, guarded in `tests/source.test.js`). Package size still needs a preview or upload.
- [ ] 5.3 Device regression as student and teacher (booking, cancel, mock payment, renewal subscribe). Flow logic is covered against the local stack through the gateway by `pnpm test:live` (`tests/live/`); still needs a phone for rendering, WeChat phone login, the cashier and the subscribe prompt.
- [x] 5.4 Point `native-stack` (no miniapp watcher; DevTools opens the source), `gateway-exposure` test, token scripts, `compose.yaml` (Taro watch service removed) and docs at `ikanyue.mini`; spec deltas for `subproject-unit-test-coverage`, `miniapp-page-api-unit-coverage`, `miniapp-report-experience`; coverage thresholds (95%) now enforced via `coverage.thresholds`.
- [ ] 5.5 Upload a trial version and accept it; then remove `ikanyue.taro3` after explicit confirmation.
