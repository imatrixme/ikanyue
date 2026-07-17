## ADDED Requirements

### Requirement: Packages and Classes Are Separate
The system SHALL represent sales packages and teaching classes as separate entities and SHALL NOT infer one from the other.

#### Scenario: Package purchase does not enroll a class
- **WHEN** a student purchases a package without an enrollment instruction
- **THEN** the system grants credits but does not create class membership

### Requirement: Class Membership Does Not Consume Credits
Joining, leaving, pausing, or transferring a class SHALL NOT directly change a student's course-credit balance.

#### Scenario: Student joins a class
- **WHEN** an authorized operator activates a student class membership
- **THEN** the membership is stored without creating a debit, freeze, or conversion

### Requirement: Many-to-Many Class Relationships
The system SHALL support students belonging to multiple classes and teachers holding multiple roles across classes with effective dates.

#### Scenario: Teacher changes during a term
- **WHEN** a new lead teacher becomes effective on a specified date
- **THEN** future session defaults use the new assignment while historical sessions retain their original teacher snapshot

### Requirement: Sessions May Combine Classes
A lesson session SHALL be able to reference one or more classes and SHALL snapshot the required credit type, quantity, time, location, and rule versions.

#### Scenario: Two classes share one lesson
- **WHEN** an operator creates a combined session for two classes
- **THEN** the session stores both class relations and one settlement configuration

### Requirement: Deduplicated Session Roster Snapshot
The system SHALL materialize a session roster and SHALL create at most one session-student record for each student, even if the student belongs to multiple linked classes.

#### Scenario: Student appears in both combined classes
- **WHEN** the combined class rosters contain the same student
- **THEN** the session contains one student record with both source class references

#### Scenario: Class membership changes after publication
- **WHEN** a student later leaves the class
- **THEN** the existing session roster remains unchanged unless an authorized roster correction is performed

### Requirement: Actual Session Teacher Assignments
The system SHALL distinguish class default teachers from the teachers who actually teach a session.

#### Scenario: Substitute teacher teaches the lesson
- **WHEN** a substitute is assigned and confirmed for a session
- **THEN** the session records the substitute as actual teacher without rewriting the class's historical default assignment
