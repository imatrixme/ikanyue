## ADDED Requirements

### Requirement: Focused Admin Navigation

Admin SHALL show five primary navigation groups by default — 今天, 学员, 约课 (日历, 预约), 收款 (订单收款, 报课) and 设置 (课程, 课包与价格, and 场馆 once venues ship) — and SHALL place 教学 (课堂, 班级, 教师工作量), 账务 (课时账户, 异常, 操作记录), 积分 (学员积分, 实物) and 高级设置 (预约规则, 历史迁移) under a collapsed "更多" group whose expanded state is remembered locally. Teacher-only accounts SHALL see their accessible groups without folding.

#### Scenario: First sign-in
- **WHEN** the founder signs in to Admin
- **THEN** only the five primary groups are visible and "更多" is collapsed

#### Scenario: Folded page stays reachable
- **WHEN** an operator opens a bookmarked URL of a folded workspace such as 课时账户
- **THEN** the workspace opens with unchanged permissions and its group stays visible under the collapsed "更多"

#### Scenario: Teacher-only account
- **WHEN** a teacher-only account signs in
- **THEN** 教学 → 课堂 is visible without expanding "更多"

### Requirement: Everyday Booking Workspace

The booking workspace SHALL show the appointment queue and the teacher course / open time configuration, and SHALL move booking policies and conflict migration into 高级设置 → 预约规则. Old `?tab=conflicts` booking links SHALL redirect there.

#### Scenario: Daily booking review
- **WHEN** the founder opens 约课 → 预约
- **THEN** no booking policy or conflict migration controls are shown

#### Scenario: Old conflict link
- **WHEN** an operator opens `/schedule/bookings?tab=conflicts`
- **THEN** Admin replaces the URL with `/schedule/booking-settings?tab=conflicts` and shows the conflict queue
