## ADDED Requirements

### Requirement: Program And Session Management Modules
The admin system SHALL expose operations modules for learning programs, learning sessions, program participants, and session participants through `/ops/*` APIs without direct PocketBase access from the browser.

#### Scenario: Administrator manages loose program
- **WHEN** an administrator creates, updates, lists, or opens a learning program
- **THEN** the admin UI calls `/ops/*` APIs and can manage optional planned dates, optional planned session count, status, and metadata

#### Scenario: Administrator manages actual session
- **WHEN** an administrator creates or updates a session under a program or as a standalone session
- **THEN** the admin UI can manage actual title, theme, time window, status, students, teachers, attendance, and teacher roles

### Requirement: Report Event Management
The admin system SHALL allow authorized operations users to create, list, open, and update report events scoped to programs, sessions, activities, or custom scopes.

#### Scenario: Administrator creates report event from program
- **WHEN** an administrator creates a report event for a learning program and selects a published report template
- **THEN** the system stores the event with scope, report type, lifecycle status, and template reference

#### Scenario: Assigned teacher creates session report event
- **WHEN** a teacher assigned to a session creates a report event for that session
- **THEN** the system accepts the event and records the teacher as actor

#### Scenario: Unassigned teacher is denied
- **WHEN** a teacher who is not assigned to the scoped program or session tries to create or update a report event
- **THEN** the system rejects the operation and records a denied audit event

### Requirement: Report Instance Management
The admin system SHALL allow authorized users to generate, list, inspect, publish, revoke, and audit report instances created from report events.

#### Scenario: Report event generates multiple student reports
- **WHEN** an administrator generates report instances for selected students under one report event
- **THEN** the system creates one report instance per selected recipient and displays them in the admin report instance list

#### Scenario: Report event generates teacher feedback reports
- **WHEN** an administrator generates report instances addressed to teachers
- **THEN** the admin report instance list includes teacher-recipient reports with subject, recipient, status, report type, and publication state

#### Scenario: Publish operation is audited
- **WHEN** an authorized user publishes a report instance
- **THEN** the system records actor, action, report instance id, timestamp, and outcome metadata

### Requirement: Role-Scoped Reporting Navigation
The admin UI SHALL show reporting actions according to the authenticated user's role and assignment scope.

#### Scenario: Admin sees global reporting modules
- **WHEN** an administrator opens the admin UI
- **THEN** the navigation includes learning programs, sessions, report templates, report events, and report instances

#### Scenario: Teacher sees assigned reporting work
- **WHEN** a teacher opens the admin UI
- **THEN** the reporting views are limited to assigned programs, assigned sessions, report events they can operate, and reports addressed to or created by them
