## Why

The founder finds the current mini program hard to read but is comfortable with 松果约课. The gap is information architecture, not capability:

- The first tab is an activity feed. No activity has been published for a long time, so the app opens on an empty calendar instead of "my lessons and booking".
- Booking is four sections deep in the course tab ("预约与购买" → "预约新课").
- Points occupy a whole tab although they are a separate, secondary reward concept that students confuse with lesson hours.
- "我的预约" and "选课与订单" appear on both the course tab and the profile tab.

See `docs/strategy/certified-teacher-platform/songguo-teardown.md` for the comparison.

## What Changes

- **Three tabs instead of four.** Students see 首页 / 约课 / 我的. Teachers see 工作台 / 日历 / 我的 on the same three slots.
  - Tab 1 is a new `pages/home/index`. Students get a studio home; teachers get the existing teacher workbench (`TeacherBookingHome`).
  - Tab 2 is the existing `pages/appointmentBooking/index`. Students get the booking page; teachers get the existing teacher calendar (`TeacherCalendarHome`).
  - Tab 3 stays `pages/profile/index`.
- **Student home** has four blocks:
  - Studio card: name, phone, and address or opening hours when configured.
  - Status card:
    - Signed out: sign in.
    - No course: book a course, call the studio or browse course packages.
    - Has courses: remaining lessons per course, validity, a low-balance hint, and one primary "去约课" action.
  - Upcoming lessons.
- **Hidden, not deleted.**
  - The activity feed leaves navigation. Its pages stay registered so shared links still open.
  - The points page and the full course overview become ordinary pages, reached from "我的".
- **Profile** groups the secondary entries: 我的预约, 我的课程, 选课与订单, 积分与兑换, 个人资料, 退出登录.
- Navigation calls that targeted the old tabs (`switchTab`/`redirectTo`/`navigateTo`) are updated to the new tab set.

## Non-goals

- No backend, schema or API change.
- No change to booking rules: requests still need teacher confirmation.
- Renewal reminders are a separate change (`add-renewal-reminders`).
- Multi-venue support is deferred.

## Impact

- Affected specs:
  - `teacher-miniapp-experience` (role-aware navigation)
  - `student-course-experience` (course tab becomes a page)
  - `miniapp-account-access` (signed-out points page)
  - new `student-miniapp-home`
- Affected code (`ikanyue.taro3` only):
  - `src/app.config.js`
  - `utils/rolemanager.js`
  - new `src/pages/home/`
  - `src/pages/appointmentBooking/`, `src/pages/profile/`, `src/pages/courses/`, `src/pages/courseOrder/`
  - `src/components/UpcomingLessons.vue`
  - the activity detail, image detail and webview fallbacks
  - a new tab icon and `src/data/studioInfo.js`
  - build guards and e2e contracts
