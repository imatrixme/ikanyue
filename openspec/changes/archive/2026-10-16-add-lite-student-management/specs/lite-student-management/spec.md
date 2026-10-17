## ADDED Requirements

### Requirement: Admin-only student management API
The system SHALL expose student list, create, and update operations only through authenticated Admin ops routes and SHALL reject non-Admin callers.

#### Scenario: Admin lists students
- **WHEN** an authenticated Admin requests the student directory with pagination, keyword, or status parameters
- **THEN** the system returns normalized student records and pagination metadata

#### Scenario: Non-Admin attempts student management
- **WHEN** a non-Admin caller requests any student-management mutation
- **THEN** the system rejects the request without changing PocketBase records

### Requirement: Student creation
The system SHALL allow an Admin to create a learner with a unique cellphone, real name, optional nickname, password, and enabled or disabled status.

#### Scenario: Admin creates a valid learner
- **WHEN** the Admin submits valid required fields and a cellphone not already assigned to another learner
- **THEN** the system creates one compatible `students` record and returns its management projection

#### Scenario: Create validation fails
- **WHEN** required fields are missing or the cellphone is already registered
- **THEN** the system returns a deterministic validation error and the editor remains open with entered values

### Requirement: Student editing and status management
The system SHALL allow an Admin to update learner identity fields, optionally reset the learner password, and enable or disable the learner without changing the learner record ID.

#### Scenario: Admin edits learner identity
- **WHEN** the Admin changes a learner name, nickname, or cellphone and saves
- **THEN** the directory and points projection refresh with the updated identity

#### Scenario: Admin disables a learner
- **WHEN** the Admin changes a learner status to disabled
- **THEN** the learner remains visible in student management and is excluded from points operations

#### Scenario: Password is left blank during edit
- **WHEN** the Admin saves an existing learner without entering a new password
- **THEN** the system preserves the existing password hash

### Requirement: List-first student management interface
The Admin SHALL provide a dedicated student-management navigation item with a desktop table, mobile cards, direct edit actions, and single-dialog create/edit workflows.

#### Scenario: Admin scans the desktop directory
- **WHEN** the viewport is at least 768 pixels wide
- **THEN** the page shows aligned columns for learner identity, cellphone, status, last login, and actions

#### Scenario: Admin manages a learner on mobile
- **WHEN** the viewport is between 320 and 767 pixels wide and the Admin opens create or edit
- **THEN** the page uses learner cards and a full-screen dialog without horizontal scrolling

### Requirement: Student directory controls and states
The student directory SHALL provide keyword search, enabled-status filtering, sorting, pagination, reset behavior, and deterministic loading, true-empty, filtered-empty, and request-failure states.

#### Scenario: Filters are applied and reset
- **WHEN** the Admin filters by keyword or status and then activates reset
- **THEN** the directory returns to its default first page and displays all available learner records

#### Scenario: No students match
- **WHEN** valid filters produce no records
- **THEN** the page distinguishes filtered-empty from a truly empty student collection and offers the relevant reset or create action

### Requirement: Student and ledger preservation
The lightweight Admin SHALL NOT hard-delete learner records and SHALL preserve all existing point-account and point-event relations during student management.

#### Scenario: Admin no longer wants a learner active
- **WHEN** the learner should no longer participate in points operations
- **THEN** the Admin disables the learner rather than deleting the learner or ledger history

### Requirement: Wide-layout control alignment
Shared Admin inputs and selects SHALL remain inside their assigned responsive grid tracks without overlapping neighboring controls.

#### Scenario: Wide points and reward filter bars
- **WHEN** the Admin is rendered on a wide desktop viewport
- **THEN** search, numeric range, status, and sorting controls align in distinct non-overlapping columns
