## 1. Account access (ikanyue.taro3)

- [x] 1.1 Login uses only the WeChat phone number; remove `getUserProfile`.
- [x] 1.2 Consent row plus `agreement` page (user agreement, privacy policy); gate both login modes; tests for the gate.
- [x] 1.3 "退出登录" row on "我的"; nickname input uses `type="nickname"`.
- [x] 1.4 Points tab hides the pass when signed out.

## 2. Activity tab

- [x] 2.1 Reorder upcoming lessons, date strip and list; remove info links from the tab.
- [x] 2.2 Day markers, honest empty state with jump to the next day; tests.
- [x] 2.3 Query today through the end of the strip, sorted by `startTime`; tests.

## 3. Booking

- [x] 3.1 Withdraw via confirmation without reason; disabled submit explains the missing reason.
- [x] 3.2 Reschedule sheet shows open windows for the day and the computed end time; tests.
- [x] 3.3 Slot submit bar only with slots; credit cancellation copy.
- [x] 3.4 Unsaved availability guard.
- [x] 3.5 Teacher naming: "工作台" title, calendar/schedule link labels.

## 4. Commerce

- [x] 4.1 API order payload includes `offerId` (hono `present`, test; the commerce swagger does not list order fields).
- [x] 4.2 Shop silent refresh, reuse pending order; tests.
- [x] 4.3 Pending order notice; booking hand-off uses `redirectTo`.

## 5. Visual system

- [x] 5.1 Raise the miniapp type scale and darken `textMuted`; sync tokens and run the design-system check.
- [x] 5.2 Hit areas of at least 44px and button roles for small controls.

## 6. Verification

- [x] 6.1 Hono lint and tests, check-docs; miniapp lint, tests (Asia/Shanghai, `test:tz`), weapp build, e2e, `visual:styles`; admin and website lint and build; `openspec validate --strict`.
