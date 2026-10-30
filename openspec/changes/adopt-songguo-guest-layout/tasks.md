## 1. Login in place

- [x] 1.1 `components/login-sheet`: WeChat phone, password, agreement and the two-identity choice moved from `pages/profile`; styles in `styles/_login.scss`.
- [x] 1.2 `services/loginGate.js`: `withAccount`, `closeLogin`, `handleLoginSuccess` (reload via `onShow`, continue a student's action); unit tests for the gate and the sheet.

## 2. Pages

- [x] 2.1 Home in the 松果 layout: shortcuts, then stacked 我的课时 and 我的约课 sections, guest state without a sign-in prompt (`HOME_SHORTCUTS`); 我的约课 shows the next lessons soonest first (`upcoming=true` on the student appointment list).
- [x] 2.2 我的 for everyone: "点击登录" with a greeting, dashed stats, the studio card, shortcuts with `account` flags; the identity switch stays for signed-in users.
- [x] 2.3 约课, 我的课程 and 积分: neutral guest cards whose action signs in on the page.
- [x] 2.4 Fewer full-width tabs: the login sheet switches mode with a text link (`LOGIN_MODE_OPTIONS` removed); `segmented-control` sizes to its options; the dashboard and teacher lessons put the period chips and the range or month stepper on one row.

## 3. Verification

- [x] 3.1 `pnpm lint`, `TZ=Asia/Shanghai pnpm test`; `test:live` signs in through the sheet and covers the guest home.
- [x] 3.2 WeChat DevTools walk-through as a guest and as a student, with screenshots.
- [x] 3.3 `openspec validate adopt-songguo-guest-layout --strict`.
