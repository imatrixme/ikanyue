## Why

The 2026-10-16 miniapp UI/UX review, done from the user's point of view, found flows that block or mislead people, plus readability gaps:

- **WeChat login.**
  - One tap fires `getUserProfile` and `getPhoneNumber` at the same time. The phone callback often arrives first and is rejected with "请先允许获取头像昵称", so the user has to tap again.
  - `getUserProfile` has returned only an anonymous avatar and nickname since 2022.
  - Login never asks the user to accept a user agreement or privacy policy before collecting the phone number.
- **Activity tab.**
  - The upcoming-lessons block sits between the date strip and the list it filters.
  - The default "today" view says "暂无近期活动" even when later days have activities.
  - The tab repeats the brand info links that already appear on "我的".
  - The query starts in 2020 with `perPage: 100`, so future activities can fall off the page.
- **Account.** "退出登录" is only reachable from the bottom of the profile-edit form.
- **Booking.**
  - Students must type a reason to withdraw their own pending request, although the API does not require one.
  - Teachers reschedule blind: they pick a free time and see neither availability nor the end time.
  - The slot page shows a disabled submit bar even in loading, empty and error states.
  - The credit-mode cancellation copy does not say that the lesson returns to the course.
  - Unsaved availability edits are dropped silently when the teacher leaves the page.
- **Teacher naming.** The tab label "工作台" opens a page titled "预约工作台", and the calendar link reads differently on each role.
- **Commerce.**
  - Returning to the shop replaces the whole page with a loading state.
  - Each "购买" tap creates another pending order, even when an unpaid one exists.
  - Pending orders never say they close after 30 minutes.
  - "选择时间预约" pushes onto an already deep stack.
- **Readability.**
  - Body text is 13px and captions go down to 9px (71 uses of ≤11px).
  - `textMuted` (#87928e) is about 3.2:1 on white and 2.9:1 on the canvas.
  - Several icon or text controls are 28–34px with no button role.
  - The points tab shows a 0 PT pass to signed-out users.

## What Changes

- **Login.**
  - Login asks only for the WeChat phone number.
  - An unchecked consent row with links to new user-agreement and privacy-policy pages gates both login modes.
  - The nickname field on the profile form uses `type="nickname"`, so WeChat can suggest the user's own nickname.
- **Profile.** "我的" gains a "退出登录" row for signed-in users; the same action stays on the profile form.
- **Activity tab.**
  - Order: upcoming lessons first, then the date strip directly above its list.
  - Days with activities get a marker.
  - An empty day says "这天没有活动" and offers a jump to the next day that has one.
  - The brand info links move off this tab (they stay on "我的").
  - The query covers today through the next 7 days, sorted by `startTime`.
- **Booking.**
  - Withdrawing a pending request is a confirm dialog with no reason field.
  - Disabled submit buttons explain what is missing.
  - The reschedule sheet shows the selected day's open windows for the course and the computed end time.
  - The slot submit bar appears only once slots are shown.
  - Credit-mode cancellation copy states that the reserved lesson returns to the course at no fee.
  - Teacher availability warns before the page is left with unsaved edits.
- **Teacher naming.** The page title matches the "工作台" tab, and the calendar link reads "查看日历" for teachers and "全部日程" for students.
- **Commerce.**
  - The shop refreshes silently after the first load.
  - Buying an offer that already has a pending order opens that order instead of creating another; this adds an additive `offerId` field to the student order payload.
  - Pending orders show the 30-minute close notice.
  - "选择时间预约" replaces the order page instead of pushing a new one.
- **Design tokens.** The miniapp type scale minimum rises to 11px and body text to 14px. `textMuted` darkens to `#66726d`, which reaches 4.5:1 on the canvas; admin and website share this color. Small controls get at least 44px hit areas and `aria-role="button"` with labels.
- **Points tab.** Signed-out users see only the sign-in prompt.

## Non-goals

- Avatar upload. `chooseAvatar` would need a file-upload endpoint; the avatar keeps the API default until one exists.
- A student "cancel order" endpoint. The payment gateway already closes unpaid payments after 30 minutes.
- A custom tab bar to remove the role label flash at cold start. The app `onShow` already applies role tabs as early as the platform allows.
- The legal wording of the agreements beyond a product draft. Operations must review it and also fill the WeChat platform privacy guide.

## Impact

- `ikanyue.taro3`:
  - Pages: profile, userinfo, activity, points, appointmentDetail, appointmentSlots, teacherAvailability, courses, courseShop, courseOrder; new `agreement` page.
  - Components and app: `AccountRow`, `SectionHeader`, `TeacherCalendarHome`, `BookingStatusBadge` (raw line-height to token), `app.config.js`, e2e build contract.
  - Page logic and tests.
- `ikanyue.mapi.hono`: `CheckoutService.present` adds `offerId`, plus its test.
- `design-system/brand-tokens.json`: miniapp type scale and `textMuted`; regenerated `*brand.generated.*` files. `ikanyue.website` replaces one raw line-height so the design-system check passes.
