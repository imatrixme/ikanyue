# student-course-experience Specification

## Purpose
TBD - created by archiving change deliver-course-tab-admin-enrollment. Update Purpose after archive.
## Requirements
### Requirement: Read-Only Student Course Experience
The mini program SHALL allow students to view courses, remaining lessons, scheduled lessons, validity, lesson details, and lesson-hour records without exposing enrollment or ledger mutation actions.

#### Scenario: Student has insufficient lessons
- **WHEN** a scheduled lesson cannot be covered by the student's current course hours
- **THEN** the page shows that teaching administration must handle it and does not offer recharge, conversion, reservation, or enrollment actions

### Requirement: Student-Facing Course Vocabulary
Student-visible course pages SHALL use course, lesson hour, schedule, attendance result, validity, and teaching-administration language and MUST NOT expose course-credit, batch, frozen, conversion-rule, reversal, operation-number, or settlement-ledger terminology.

#### Scenario: Student views a completed lesson
- **WHEN** a completed lesson consumed one internal course credit
- **THEN** the page says that the lesson was completed and used one lesson hour without showing the underlying batch or credit event

### Requirement: Course Detail and Lesson History
The mini program SHALL provide course detail, course schedule, lesson detail, and paginated lesson-hour record pages with pull-to-refresh on data-loading pages.

#### Scenario: Student loads older lesson records
- **WHEN** the student reaches the end of the lesson-hour record page and more records exist
- **THEN** the next page loads without duplicating existing records

### Requirement: Student Learning Projection Boundary
Student course pages SHALL consume only `/v1/student/learning/*` projections and SHALL NOT call student course-credit conversion, authorization, reservation, batch, or raw event endpoints.

#### Scenario: Projection response is returned
- **WHEN** `kanyue.server` returns a student learning overview
- **THEN** it omits credit type ids, batch ids, frozen quantities, conversion rules, operation numbers, and raw event metadata

### Requirement: Course Overview Page
The mini program SHALL keep a dedicated course overview page reached from "我的", and SHALL NOT register it as a tab.

#### Scenario: Student opens the course overview
- **WHEN** an authenticated student opens "我的课程" from "我的"
- **THEN** the mini program shows the next lesson, enrolled courses, validity warnings, and recent lesson records

