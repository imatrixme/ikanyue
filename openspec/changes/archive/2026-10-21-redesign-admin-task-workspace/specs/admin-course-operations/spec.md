## MODIFIED Requirements

### Requirement: Routed Course Operations Workspaces
Admin SHALL provide stable URL routes grouped into six task sections — 今天 (`/today`), 学员 (`/students`, `/students/:studentId`), 课表 (`/schedule/calendar`, `/schedule/lessons`, `/schedule/bookings`, `/schedule/classes`, `/schedule/workload`), 账务 (`/billing/enrollments`, `/billing/orders`, `/billing/lesson-hours`, `/billing/exceptions`, `/billing/audit`), 积分 (`/points/students`, `/points/rewards`) and 设置 (`/settings/courses`, `/settings/packages`, `/settings/migration`) — and SHALL redirect the previous single-level paths to their new routes while preserving the query string.

#### Scenario: Operator opens a detail drawer
- **WHEN** the operator opens a student, package, class, lesson, or account detail
- **THEN** the list route and filters remain active while detail appears in a drawer or dialog

#### Scenario: Legacy link
- **WHEN** an operator follows `/lessons?sessionId=lesson_1` or another pre-redesign path
- **THEN** Admin replaces it with the new route and keeps the query string

### Requirement: Student Course Workspace
The student detail SHALL combine profile, lesson-hour balance, upcoming lessons, enrolled courses, class memberships, lesson history, existing points, and audit context without exposing unrelated students. Administrators SHALL see it as a dedicated page at `/students/:studentId`; teacher accounts SHALL keep a drawer limited to their assigned classes and lessons.

#### Scenario: Operator starts enrollment from a student
- **WHEN** an authorized operator selects “报课” from student detail
- **THEN** Admin opens the enrollment workflow with the student preselected

### Requirement: Capability-Scoped Navigation
Admin SHALL derive visible sections, section tabs and allowed actions from server-provided capabilities and SHALL still rely on Hono for authoritative authorization. A section SHALL be visible only when at least one of its tabs is accessible, and selecting it SHALL open its first accessible tab.

#### Scenario: Teacher opens Admin
- **WHEN** a teacher has only assigned-teaching capabilities
- **THEN** Admin shows assigned students and lessons but hides prices, account adjustments, global audit, points, and rewards management

#### Scenario: Teacher sees a personal schedule section
- **WHEN** a teacher-only account opens the 课表 section
- **THEN** the section is labelled "我的课表" and only tabs allowed by its capabilities are shown
