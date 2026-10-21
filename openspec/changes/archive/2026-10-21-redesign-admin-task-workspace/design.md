## Context

Admin users are identified by capabilities, not job titles:

- `isAdmin`: owner/administrator, sees everything.
- `course_credit.academic`: 教务 (scheduling, classes, bookings).
- `course_credit.teacher`: teachers (own lessons, attendance, workload).
- `course_credit.settlement`: settlement.
- `course_credit.finance`: catalog, enrollments, orders, accounts.
- `course_credit.audit`: audit and reconciliation.

Assumptions (the business did not state otherwise):

- Admin is used by the owner, 教务 and teachers.
- One-to-one lessons are mainly self-booked by students and confirmed by 教务.
- Class lessons are scheduled by 教务 through the visual scheduler.

## Goals / Non-Goals

**Goals**
- The first screen answers "what do I need to do now" with real rows.
- Every business object has one obvious home:
  - A student → 学员 detail.
  - A lesson → 课表.
  - Money → 账务.
  - Points → 积分.
  - Configuration → 设置.
- Remove decorative chrome so the content leads.

**Non-Goals**
- Backend, data model or permission changes.
- Admin-side one-to-one booking (no endpoint; follow-up).
- Rewriting each list page's internals beyond header and empty-state cleanup.

## Decisions

### Sections over views

The `AppView` keys stay; each one is still a page with its own `canAccessView` rule. A new `navigationSections` list groups views into six sections, and each section owns ordered tabs.

| Section | Tabs (view → path) |
|---|---|
| 今天 | dashboard → `/today` |
| 学员 | students → `/students` (detail `/students/:studentId`) |
| 课表 | calendar → `/schedule/calendar`, lessons → `/schedule/lessons`, appointments → `/schedule/bookings`, classes → `/schedule/classes`, teachers → `/schedule/workload` |
| 账务 | enrollments → `/billing/enrollments`, payments → `/billing/orders`, accounts → `/billing/lesson-hours`, exceptions → `/billing/exceptions`, audit → `/billing/audit` |
| 积分 | points → `/points/students`, rewards → `/points/rewards` |
| 设置 | courses → `/settings/courses`, packages → `/settings/packages`, migration → `/settings/migration` |

How navigation behaves:

- A section is visible when any of its tabs is accessible.
- Clicking a section opens its first accessible tab.
- Tabs render only when a section has more than one accessible tab.
- Teacher-only accounts see the 课表 section labelled "我的课表".

Exceptions and audit sit under 账务 because both concern lesson-hour and money reconciliation. Classes sit under 课表 because 教务 manage them alongside lessons.

**Alternative considered:** merge pages into new composite screens, e.g. a lesson page with an embedded calendar. Rejected: it rewrites working, tested flows for little gain. Tabs give the same mental model at a fraction of the risk.

### Legacy URLs

Every old path (`/dashboard`, `/lessons`, `/lesson-hours`, `/payments`, `/rewards` …) is a `<Navigate replace>` to its new path, and the `search` string is preserved. That keeps bookmarks and links such as `?sessionId=` working.

`viewFromPath` resolves both new and legacy paths, so the active section is correct during the redirect render.

### Today page

There is one load, gated by capability exactly like the old dashboard:

- lessons (or assigned lessons)
- enrollments, accounts
- teacher events
- settlement and reconciliation exceptions
- booking dashboard
- managed students (for names)

Groups and actions:

| Group | Rows | Opens |
|---|---|---|
| 今日课堂 | Lessons whose local start date is today, sorted by time | `/schedule/lessons?sessionId=` |
| 待确认预约 | Booking dashboard `pending` rows | `/schedule/bookings?status=pending` |
| 待核销 | Lessons in `completed` or `correction_pending` (settlement capability) | `/schedule/lessons?sessionId=` |
| 需要续课 | Accounts that have consumed or expired hours, now hold ≤ 2 available and none frozen (finance capability) | `/students/:studentId` |
| 待同步名单 | Enrollments in `synchronizing_future_lessons` | `/billing/enrollments` |
| 异常 | Settlement and reconciliation exceptions | `/billing/exceptions` |
| 待确认工作量 | Pending teacher events | `/schedule/workload` |

- Each lesson row shows a "下一步" label derived from `lessonActions` and the attendance state: 待上课 / 待结课 / 待核销 / 已核销 / 已取消.
- Empty groups are hidden. If every group is empty, the page says "今天没有待办".
- The local date key is computed with `Date` local getters, so it does not depend on UTC.

The renewal threshold of 2 is a constant (`RENEWAL_THRESHOLD`) next to the query. It is not configurable; the business has no stated policy.

### Student detail page

For administrators, the student row's "详情" action navigates to `/students/:studentId` instead of opening a drawer. The page loads the same data the drawer loaded:

- account
- class students
- session students
- enrollments
- audit
- points
- class, lesson and package catalogs

The upcoming lessons list joins session students with lessons and keeps those with `startAt` ≥ now and not cancelled, sorted ascending.

Actions on the page:

- "报课/续课" → `/billing/enrollments?new=1&studentId=…`
- "积分" → `/points/students`

Non-admin accounts keep the existing assigned-relations drawer, because the detail endpoints require global capabilities.

### Lessons page

- **Deep link.** After the list loads, a `sessionId` search parameter opens that lesson's panel. The parameter is cleared when the panel closes.
- **Scope filter.** `scope` = `upcoming` (default) | `todo` | `all`.
  - `upcoming`: start ≥ today 00:00 local and status not cancelled or settled.
  - `todo`: lessons that can be completed now (`lessonActions().complete`) or are `completed` / `correction_pending` and await settlement.
  - The count of each scope is shown in the control.

### Visual system

- **`PageHeader`** takes only `title` and `actions` and renders a single row (h1 + actions). The `icon`, `eyebrow`, `description` and `badge` props are removed from the type, so no caller can reintroduce them.
- **Navigation icons:** lucide `CalendarCheck2`, `Users`, `CalendarDays`, `Wallet`, `Award`, `Settings`, at 16px, monochrome.
- **Active nav item:** a muted background with foreground text, instead of a filled brand block.
- **`EmptyState`:** title only, plus the reset or create action. No coloured icon tile and no template paragraph.
- **`Tooltip`:** shows on `group-hover` and `group-has-[:focus-visible]`. `IconButton` drops `title`.

## Risks / Trade-offs

- Renaming paths could break deep links from outside Admin. Mitigation: legacy redirects preserve the query string.
- Tests and e2e flows that click old navigation labels must be updated, and they verify the new IA.
- The renewal threshold is a guess. It is shown in the group title ("剩余 ≤ 2 课时") so the operator sees the rule.

## Migration Plan

This is a front-end-only deploy, and rollback is reverting the Admin build. No data migration.
