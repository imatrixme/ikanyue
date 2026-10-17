## ADDED Requirements

### Requirement: Admin-Initiated Automatic Enrollment
The system SHALL let an authorized operator enroll a student by selecting a course package, price, payment facts, and optional class assignment in one reviewed workflow.

#### Scenario: Enrollment includes a class
- **WHEN** an authorized operator confirms a paid package and selected class
- **THEN** the system creates the order snapshot, grants the course hours, creates the class membership, records audit metadata, and enqueues future-lesson synchronization

### Requirement: Atomic Enrollment Main Transaction
Order grant, course-hour issuance, optional class membership, enrollment operation, audit summary, and synchronization outbox creation MUST commit in one PocketBase SDK Batch or fully roll back.

#### Scenario: Class membership write fails
- **WHEN** the selected class membership cannot be created during enrollment
- **THEN** no order grant, course-hour batch, membership, audit success, or outbox event is committed

### Requirement: Idempotent Enrollment
Automatic enrollment SHALL require a scoped idempotency key and SHALL replay the original immutable result for duplicate delivery.

#### Scenario: Operator retries after a timeout
- **WHEN** the same enrollment request is submitted again with the original idempotency key
- **THEN** the system returns the original enrollment result without duplicating orders, hours, memberships, or sync tasks

### Requirement: Explicit Published-Lesson Roster Synchronization
Enrollment SHALL NOT silently modify already-published lesson rosters and SHALL expose a preview of affected future lessons before an authorized roster correction.

#### Scenario: Class already has published future lessons
- **WHEN** a student is enrolled into that class
- **THEN** the enrollment succeeds with a pending synchronization summary and the published rosters remain unchanged until confirmed

### Requirement: Enrollment Status Visibility
Admin SHALL show whether enrollment is completed, awaiting class assignment, synchronizing future lessons, completed with warnings, or failed.

#### Scenario: Future lesson synchronization fails
- **WHEN** the outbox worker cannot synchronize one or more future lessons
- **THEN** the enrollment remains valid and an actionable exception is shown without duplicating the main transaction

