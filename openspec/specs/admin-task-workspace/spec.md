# admin-task-workspace Specification

## Purpose
TBD - created by archiving change redesign-admin-task-workspace. Update Purpose after archive.
## Requirements
### Requirement: Task-Oriented Today Page
Admin SHALL open on a Today page that lists the concrete records the signed-in operator can act on now, grouped by task, instead of counters that require further navigation.

#### Scenario: Operator opens Admin in the morning
- **WHEN** an operator with academic, settlement and finance capabilities opens `/today`
- **THEN** Admin lists today's lessons by start time with their next step, pending bookings, lessons awaiting settlement, students who have used lesson hours and now hold two or fewer with nothing booked, enrollments awaiting roster sync, exceptions and pending teacher workload
- **AND** each row opens the exact lesson, booking queue, student or page that resolves it

#### Scenario: Today uses the local calendar day
- **WHEN** the local time is 07:30 in Asia/Shanghai and a lesson starts at 09:00 the same local day
- **THEN** the lesson appears under 今日课堂 even though the UTC date is the previous day

#### Scenario: Nothing to do
- **WHEN** every task group is empty for the operator's capabilities
- **THEN** Today shows a single "今天没有待办" state and no empty groups

#### Scenario: Capability-scoped groups
- **WHEN** a teacher-only account opens Today
- **THEN** only its assigned lessons and its pending workload groups load, and finance or settlement queries are not requested

### Requirement: Administrator Student Detail Page
Administrators SHALL open each student on a dedicated page that gathers lesson-hour balance, upcoming lessons, enrollments, classes, points and recent operations, with renewal and points actions.

#### Scenario: Administrator renews a student
- **WHEN** an administrator opens `/students/:studentId` and chooses "报课/续课"
- **THEN** Admin opens the enrollment dialog in 账务 with that student preselected

#### Scenario: Upcoming lessons on the student page
- **WHEN** the student is on the roster of future lessons
- **THEN** the page lists those lessons by start time with their status, excluding cancelled lessons

### Requirement: Lesson Deep Link and Scope
The lessons page SHALL open the lesson named by the `sessionId` query parameter and SHALL default to upcoming lessons with explicit todo and all scopes.

#### Scenario: Opening a lesson from a booking or the calendar
- **WHEN** an operator follows `/schedule/lessons?sessionId=lesson_1`
- **THEN** the lesson panel for `lesson_1` opens after the list loads, and closing it removes the parameter

#### Scenario: Default scope
- **WHEN** the operator opens the lessons page without a scope
- **THEN** only lessons starting today or later that are not cancelled or settled are listed, and the operator can switch to 待处理 or 全部

### Requirement: Single-Price Enrollment Default
The enrollment dialog SHALL select the package price automatically when the chosen package has exactly one active price.

#### Scenario: Package with one price
- **WHEN** the operator selects a package that has exactly one active price version
- **THEN** that price is selected and the operator can submit without opening the price picker

#### Scenario: Package with several prices
- **WHEN** the selected package has more than one active price version
- **THEN** no price is preselected and the operator must choose one

### Requirement: Quiet Admin Visual Language
Admin pages SHALL lead with content: a one-line header of title and actions, monochrome navigation icons, status-only colour, and factual empty states.

#### Scenario: Page header
- **WHEN** any workspace renders its header
- **THEN** it shows the page title and its actions only, without illustration, eyebrow, description or count badge

#### Scenario: Dialog opens
- **WHEN** a dialog or drawer opens and focuses its close button programmatically
- **THEN** no tooltip appears until the operator hovers it or reaches it by keyboard

