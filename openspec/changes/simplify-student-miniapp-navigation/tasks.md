## 1. Navigation

- [x] 1.1 Register `pages/home/index` as tab 1 and `pages/appointmentBooking/index` as tab 2 in `src/app.config.js`; the course, points and activity pages stay registered but leave the tab bar.
- [x] 1.2 Update `utils/rolemanager.js` student and teacher tab labels/icons for the three slots, with tests.
- [x] 1.3 Add the `tab-home` icon source and regenerate icons.
- [x] 1.4 Replace navigation calls that targeted removed tabs (activity, courses, points) or used `navigateTo`/`redirectTo` on the booking tab.

## 2. Pages

- [x] 2.1 Add `src/pages/home/` with the studio card, status card, low-balance hint and upcoming lessons for students, and the teacher workbench for teachers; put pure logic in `pageLogic.js` with tests.
- [x] 2.2 Add `src/data/studioInfo.js`; hide address and hours until the founder supplies them.
- [x] 2.3 Render the teacher calendar on the booking tab for teachers.
- [x] 2.4 Regroup the profile entries: 我的预约, 我的课程, 选课与订单, 积分与兑换.

## 3. Guards and verification

- [x] 3.1 Update `scripts/verify-student-course-boundary.mjs` and `tests/e2e/*` to the new tab contract.
- [x] 3.2 Run `pnpm lint`, `TZ=Asia/Shanghai pnpm test`, `pnpm test:tz`, `pnpm build:weapp`, `pnpm test:e2e`.
- [ ] 3.3 Preview with an H5 build and capture screenshots; record that WeChat devtools acceptance is still pending.
