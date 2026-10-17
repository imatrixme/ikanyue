## ADDED Requirements

### Requirement: Loose Learning Programs
The system SHALL model course packages, trial lessons, activities, and custom teaching projects as learning programs with optional planned dates, optional planned session count, lifecycle status, and structured metadata.

#### Scenario: Program can be created without fixed schedule
- **WHEN** an administrator creates a learning program with a title, type, and status but without planned dates or planned session count
- **THEN** the system stores the program and allows sessions, participants, and report events to be attached later

#### Scenario: Program list exposes searchable fields
- **WHEN** an authorized operations user lists learning programs
- **THEN** the response includes first-class fields for title, type, status, planned dates, planned session count, and updated time without requiring JSON parsing

### Requirement: Actual Learning Sessions
The system SHALL model actual classes, activity occurrences, or ad hoc meetings as learning sessions that can optionally belong to a learning program and have their own theme, time window, status, and metadata.

#### Scenario: Session participation can differ from program plan
- **WHEN** a session is created under a program
- **THEN** the session can record a different set of teachers and students from the program-level assignments

#### Scenario: Standalone session is supported
- **WHEN** an administrator creates a session without a parent program for a one-off experience lesson or activity
- **THEN** the system stores the session and allows report events to use it as their scope

### Requirement: Program and Session Participation
The system SHALL store teacher and student participation through join records at both program and session level, including role or attendance status where applicable.

#### Scenario: Multiple teachers can teach one session
- **WHEN** an administrator assigns more than one teacher to the same learning session
- **THEN** the system stores each teacher assignment with a role and allows all assigned teachers to be considered in report authorization

#### Scenario: Student absence is recorded per session
- **WHEN** a student enrolled in a program misses one session
- **THEN** the system records the session-level student status as absent without removing the student from the program

### Requirement: Generic Report Templates
The system SHALL support report templates for multiple report types, including student assessment reports, teacher feedback reports, session reports, program summaries, and custom report types.

#### Scenario: Template declares report type
- **WHEN** an administrator creates a report template
- **THEN** the template stores a report type, audience metadata, schema JSON, status, and version fields

#### Scenario: Published template is immutable for generated reports
- **WHEN** a report instance is generated from a published template
- **THEN** the report instance stores the template identifier and template snapshot needed to render historical reports even if the template changes later

### Requirement: Report Events
The system SHALL launch report work through report events that define scope, template, report type, lifecycle status, and intended subject and recipient rules.

#### Scenario: Program-level report event is created
- **WHEN** an administrator creates a report event scoped to a learning program
- **THEN** the event stores `scopeType` as `program`, the program identifier as `scopeId`, and can generate report instances for participants in that program

#### Scenario: Session-level report event is created
- **WHEN** a teacher assigned to a session creates a report event scoped to that session
- **THEN** the event stores `scopeType` as `session`, the session identifier as `scopeId`, and can generate report instances for participants in that session

### Requirement: Evaluation Inputs
The system SHALL store evaluation inputs separately from final report instances so teacher assessments, student feedback, attendance notes, and custom scoring inputs can be collected before publication.

#### Scenario: Teacher submits evaluation input for a student
- **WHEN** an assigned teacher submits evaluation answers for a student under an open report event
- **THEN** the system stores evaluator, target, template, answer JSON, score JSON, and submitted status without publishing a report automatically

#### Scenario: Multiple inputs can feed one report
- **WHEN** more than one evaluator submits inputs for the same report event and subject
- **THEN** the system keeps each input as a separate record and allows a generated report instance to reference the contributing input identifiers

### Requirement: Report Instances and Recipients
The system SHALL issue concrete report instances with explicit subject, recipient, scope, status, report JSON, publication time, and optional source linkage.

#### Scenario: Student receives multiple reports for one activity
- **WHEN** two report events under the same activity or program generate different student-facing report types for the same student
- **THEN** the system stores two report instances with distinct report types and returns both in the student's report history after publication

#### Scenario: Teacher receives feedback report
- **WHEN** an event generates a teacher feedback report about a teacher and addresses it to that teacher
- **THEN** the system stores `subjectType` and `recipientType` as teacher records and allows that teacher to view the published report

#### Scenario: Admin summary is internal
- **WHEN** an event generates an administrator-only program summary
- **THEN** the system stores the report instance with an administrator recipient rule and excludes it from student and teacher personal report lists

### Requirement: Report Visibility Authorization
The system SHALL enforce report visibility by role, assignment, publication status, recipient type, and recipient identifier.

#### Scenario: Recipient can read published report
- **WHEN** an authenticated student or teacher requests a published report instance addressed to their account
- **THEN** the system returns the privacy-safe report projection

#### Scenario: Non-recipient is denied
- **WHEN** an authenticated student or teacher requests a report instance addressed to another user
- **THEN** the system rejects the request without exposing report content

#### Scenario: Draft report is hidden from recipient
- **WHEN** a student or teacher requests a report instance addressed to them before it is published
- **THEN** the system rejects the request or omits the report from list responses

### Requirement: Privacy-Safe Report Projection
All public, student-facing, and teacher-facing report APIs SHALL return report payloads through explicit whitelist projections for subject, recipient, teacher, student, template, and report fields.

#### Scenario: Raw PocketBase user fields are excluded
- **WHEN** a report response includes student or teacher display information
- **THEN** the response excludes email, phone, id card, OpenID, union ID, auth metadata, collection metadata, and internal admin flags

#### Scenario: Report envelope is stable
- **WHEN** a report response is returned to the mini program or a share link
- **THEN** the response includes stable envelope fields such as id, title, reportType, scope, subject, recipient, status, publishedAt, summary, score, sections, and recommendations where available
