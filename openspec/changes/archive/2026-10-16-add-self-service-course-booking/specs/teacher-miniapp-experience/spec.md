## ADDED Requirements

### Requirement: Verified Teacher WeChat Identity
The system SHALL bind a WeChat identity to an existing verified teacher before granting teacher mini-program access and SHALL NOT auto-create teacher records from WeChat login.

#### Scenario: Existing teacher binds successfully
- **WHEN** a verified and unblocked teacher completes WeChat phone authorization and selects the matching teacher identity
- **THEN** the system stores a teacher identity binding and issues a teacher-scoped session

#### Scenario: Phone matches student and teacher
- **WHEN** the authorized phone number matches both a student and a verified teacher
- **THEN** the system returns a short-lived role-selection challenge and issues no role token until the user selects an allowed identity

#### Scenario: Unknown person requests teacher access
- **WHEN** no verified teacher record matches the authorized identity
- **THEN** the system refuses teacher access and does not create a teacher account

### Requirement: Role-Aware Mini-Program Navigation
The mini program SHALL present role-specific navigation while preserving the existing student information architecture.

#### Scenario: Student opens the mini program
- **WHEN** the active identity is a student
- **THEN** the TabBar displays 活动、课程、积分、我的 and teacher-only routes remain inaccessible

#### Scenario: Teacher opens the mini program
- **WHEN** the active identity is a teacher
- **THEN** the TabBar displays 活动、工作台、预约、我的 and student financial or reward data remains inaccessible

### Requirement: Teacher Appointment Workbench
The teacher mini-program SHALL provide a scene-oriented workbench for pending decisions, today's teaching schedule, confirmed appointments, and conflict outcomes.

#### Scenario: Teacher reviews a pending request
- **WHEN** a teacher opens a request assigned to them
- **THEN** the page shows the student, human-readable course, requested time, location, response deadline, availability context, and confirm or decline actions without ledger identifiers

#### Scenario: Teacher confirms a request that just became unavailable
- **WHEN** confirmation loses a concurrent slot or eligibility race
- **THEN** the interface shows a stable conflict state, refreshes the queue, and does not display raw backend errors

### Requirement: Teacher Availability Editor
The teacher mini-program SHALL let a teacher maintain weekly availability and date-specific exceptions within the institution policy.

#### Scenario: Teacher saves weekly availability
- **WHEN** a teacher enables weekdays and adjusts morning or afternoon ranges
- **THEN** the system validates complete lesson fit, removes overlaps, updates one availability version, and shows the resulting next available dates

#### Scenario: Teacher adds leave
- **WHEN** a teacher marks a date range unavailable
- **THEN** new slots disappear for that range while confirmed appointments are shown separately for deliberate cancellation or rescheduling

### Requirement: Student-Safe and Teacher-Safe Presentation
Mini-program appointment projections SHALL use course, lesson, schedule, and appointment language and SHALL not expose internal ledger, claim, capability, or PocketBase fields.

#### Scenario: Appointment pages are compiled
- **WHEN** the WeChat build contract checks appointment pages and shared chunks
- **THEN** the output contains required natural-language labels and excludes internal forbidden terms and endpoint families

### Requirement: Booking Visual Consistency
New booking surfaces SHALL use the existing Kanyue design tokens, responsive page chrome, imagegen business-icon style, and compact mini-program image assets.

#### Scenario: Booking states render across roles
- **WHEN** student and teacher booking pages render loading, empty, ready, conflict, and error states
- **THEN** typography, spacing, colors, hero treatment, list hierarchy, icon sizing, and bounce-safe page backgrounds remain consistent with existing course and profile pages
