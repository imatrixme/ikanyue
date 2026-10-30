## Why

The founder finds the signed-out mini program off-putting. 首页, 约课, the course page and the points page each open on their own "登录后查看… / 去登录" card. Signing in only happens on "我的", so the user then has to find the way back. The three tabs also drifted from the 松果约课 layout the founder is comfortable with (`docs/strategy/certified-teacher-platform/songguo-teardown.md`).

## What Changes

- **No login walls.** A guest sees the same pages as a student, with empty or dashed personal parts.
  - Only acting on something personal asks for an account: 课程课包, 我的课时, the stats, 我的订单 and similar.
  - The tap opens a shared login sheet on the current page instead of jumping to "我的".
  - After sign-in the page reloads in place, and a student's tapped action continues. A teacher lands on their workbench instead.
- **Shared login sheet.**
  - WeChat phone login, password login, the agreement tick and the two-identity choice move from the profile page into one `login-sheet` component.
  - Every page that has a guest view uses it.
- **松果 home layout.**
  - Venue cover with the venue card.
  - A row of four shortcuts: 场馆信息 / 课程课包 / 去约课 / 我的课时.
  - Two stacked sections, no tabs:
    - **我的课时**: the lesson balance; or for guests and students without lessons, the existing "开始学习" card.
    - **我的约课** (signed in only): up to three bookings still ahead (cancelled or declined ones stay under 全部约课), or a quiet line.
- **Fewer full-width tabs.** Full-width segmented tabs take space and hide information.
  - The login sheet switches between WeChat and password login with a text link.
  - The shared `segmented-control` sizes to its options. The dashboard puts the period chips and the range or month stepper on one row.
- **松果 profile layout for everyone.**
  - Header: "点击登录" with a time-of-day greeting.
  - Stats showing dashes for guests.
  - The studio card.
  - Shortcuts: 我的订单, 课时记录, 个人资料, 用户协议, and 切换身份 when there are two identities.
- **约课 tab.** A guest sees a neutral "在线约课" card whose action signs in on the spot.

## Non-goals

- No server or API change.
- Booking, purchase and points rules stay the same.
- The secondary pages (`rewardCatalog`, `pointsHistory`, `appointmentSlots`) keep their current signed-out handling. They are only reached from signed-in pages.

## Impact

- Affected specs:
  - `student-miniapp-home`: the signed-out home.
  - `miniapp-account-access`: the signed-out points page and in-place sign-in.
- Affected code (`ikanyue.mini` only):
  - new `components/login-sheet` and `services/loginGate.js`;
  - `pages/home`, `pages/appointmentBooking`, `pages/courses`, `pages/points`, `pages/profile`;
  - `core/home.js`, `core/profile.js`, `styles/_login.scss`;
  - tests.
