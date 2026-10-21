## Why

The 2026-10-18 Admin inventory found that operators cannot tell where to start, even though the APIs and data are correct.

- **Navigation mirrors database tables, not jobs.** The sidebar has 17 entries in 5 groups (课程规格, 课包与价格, 报课管理, 班级管理, 课堂管理, 机构课表, 课程预约, 课时账户 …). An operator who wants to "take today's lessons" or "renew a student" has to know which table holds that step.
- **The dashboard is a grid of counters.** "今日工作台" shows eight cards with a number and an "进入处理" button. It never lists the actual lessons, bookings or students, so every task needs another navigation step and a search.
- **Students have no home.** Student detail is a drawer of plain text lines. Balance, upcoming lessons, enrollments and points are not in one place, and "报课" jumps to another module.
- **Lesson deep links are broken.** Bookings and the calendar link to `/lessons?sessionId=…`, but the lessons page ignores `sessionId`, so the lesson never opens.
- **"Today" uses UTC.** The dashboard and lessons page compare `startAt` with `new Date().toISOString().slice(0, 10)`. Before 08:00 in Shanghai, "today" is yesterday.
- **Enrollment needs a redundant step.** After choosing a package, the operator must also open the price picker even when the package has a single active price.
- **The visual design reads as generated filler ("AI slop").**
  - Every page header stacks a PNG illustration, a coloured eyebrow, a title, a count badge and a one-sentence description, and the top bar repeats the eyebrow.
  - Navigation uses 14 decorative PNG icons.
  - Empty states use template copy ("创建或同步第一条…记录后会显示在这里").
  - The close-button tooltip pops up on every dialog open because the tooltip shows on `focus-within` and dialogs focus the close button first.
  - Icon buttons show both a native `title` and a custom tooltip.

## What Changes

- **Task-oriented navigation.** The sidebar keeps six sections: 今天, 学员, 课表, 账务, 积分, 设置. Each section shows its pages as tabs. Existing pages and capability checks are reused. Old URLs redirect to the new ones and keep their query string.
- **今天 (`/today`).** A task list replaces the counter grid. Each group lists real rows and opens the exact record:
  - 今日课堂 (attendance, completion, settlement status per lesson)
  - 待确认预约
  - 待核销课堂
  - 需要续课的学员 (students who have used lesson hours and now hold two or fewer, with nothing booked)
  - 待同步名单
  - 异常
  - 待确认工作量

  "Today" uses the operator's local date.
- **学员 detail page (`/students/:studentId`).** Administrators get a full page instead of a drawer:
  - Lesson-hour balance, upcoming lessons, enrollments, classes, points and recent operations.
  - "报课/续课" opens enrollment with the student preselected.
  - Teacher accounts keep the assigned-relations drawer.
- **课表.** Tabs: 日历, 课堂, 预约, 班级, 教师工作量.
  - The lessons page opens the lesson named by `?sessionId=`.
  - The lessons page defaults to upcoming lessons, with 待处理 and 全部 filters.
- **账务.** Tabs: 报课, 订单收款, 课时账户, 异常, 操作记录.
  - In the enrollment dialog, a package with exactly one active price selects that price automatically.
- **积分.** Tabs: 学员积分, 实物.
- **设置.** Tabs: 课程, 课包与价格, 历史迁移.
- **Visual cleanup.**
  - Page headers become one line: title plus actions. The illustration, eyebrow, description and count badge are removed.
  - Navigation uses small monochrome lucide icons. PNG business icons are deleted.
  - The top bar shows the section name instead of an eyebrow.
  - Empty states state the fact without template copy.
  - Tooltips appear only on hover or keyboard focus (`:focus-visible`), and icon buttons no longer set `title`.

## Non-goals

- No API, data or permission changes. Every action still calls the existing Hono endpoints, and Hono remains the authority.
- **No admin-side one-to-one booking.** Hono has no ops endpoint for creating an appointment on a student's behalf, so one-to-one lessons still come from student self-booking and are confirmed in 课表 › 预约. This is a backend follow-up, not part of this change.
- The students list does not gain balance or next-lesson columns; it would need a batched account query. Those facts live on the detail page and in 今天.
- Other stale Admin specs (`admin-scene-workflow-ux`, `admin-human-workflow-ux`, `admin-table-dialog-workflows`, `ops-admin-system`, `admin-content-publishing`) are reported as drift and left unchanged.

## Impact

- Affected specs:
  - `admin-course-operations` (MODIFIED routing, student workspace and navigation)
  - `admin-operations-ui-system` (MODIFIED workspace structure)
  - new `admin-task-workspace`
- Affected code: `ikanyue.admin` only.
  - Navigation, shell and sidebar.
  - Routes.
  - Dashboard → Today.
  - Student detail page.
  - Lessons deep link and scope filter.
  - Enrollment dialog.
  - `PageHeader` and its callers, `EmptyState`, `Tooltip`/`IconButton`.
  - Unit and e2e tests.
