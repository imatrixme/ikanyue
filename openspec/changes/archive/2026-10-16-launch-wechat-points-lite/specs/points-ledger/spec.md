## ADDED Requirements

### Requirement: Student Point Balance
The system SHALL maintain a student point balance that can be read by the mini program and lite admin.

#### Scenario: Student balance is returned
- **WHEN** an authenticated student requests their point summary
- **THEN** the system returns the student's current point balance and recent point events without exposing other students' data

#### Scenario: Admin reads student balance
- **WHEN** an authenticated lite admin requests a student's point summary
- **THEN** the system returns that student's balance and ledger history

### Requirement: Immutable Point Events
The system SHALL record every point change as an immutable event with the resulting balance.

#### Scenario: Points are added by admin
- **WHEN** an authenticated lite admin adds points to a student with a positive amount and reason
- **THEN** the system creates a positive `point_events` record, updates the `student_points` snapshot, and records the resulting balance

#### Scenario: Invalid point addition is rejected
- **WHEN** an admin attempts to add zero, negative, or non-numeric points
- **THEN** the system rejects the request without changing the student's balance

#### Scenario: Event history preserves operator context
- **WHEN** an admin-created point event is stored
- **THEN** the event includes the student, delta, event type, balance after change, operator, reason, remark, and creation time

### Requirement: Backend-Owned Balance Mutations
The system MUST mutate student point balances only through backend point services.

#### Scenario: Client cannot choose balance after mutation
- **WHEN** a client sends a point mutation request
- **THEN** the backend calculates the new balance from the stored snapshot and ignores any client-provided balance

#### Scenario: Missing balance snapshot is initialized
- **WHEN** a point mutation is requested for a student with no existing `student_points` record
- **THEN** the backend creates a zero-balance snapshot before applying the mutation

### Requirement: Point Ledger Auditability
The system SHALL make point additions and deductions auditable through lite admin history.

#### Scenario: Admin views point event history
- **WHEN** a lite admin opens a student's point history
- **THEN** the system returns events ordered newest first with enough context to explain why points were added or deducted
