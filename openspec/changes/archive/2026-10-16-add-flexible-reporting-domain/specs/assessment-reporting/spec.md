## ADDED Requirements

### Requirement: Assessment Reports Integrate With Generic Report Instances
Submitted assessment records SHALL continue to create immutable assessment report snapshots and SHALL also be representable as generic report instances for unified report history and admin reporting workflows.

#### Scenario: Assessment snapshot creates generic source linkage
- **WHEN** an assessment record is submitted and its report snapshot is generated
- **THEN** the system can create or expose a report instance with `sourceType` equal to `assessment_snapshot`, `sourceId` equal to the snapshot identifier, `reportType` equal to a student assessment report type, and the assessed student as recipient

#### Scenario: Legacy route remains compatible
- **WHEN** the mini program or a share link requests an existing assessment report through the legacy assessment report route
- **THEN** the system returns the existing report envelope without requiring the caller to know about generic report instance identifiers

### Requirement: Assessment Report Projection Is Whitelist-Based
Assessment report snapshots SHALL be rendered through the same privacy-safe projection rules used by generic report instances.

#### Scenario: Student and teacher objects are projected
- **WHEN** an assessment report response includes student or teacher information from PocketBase records
- **THEN** only display-safe fields such as id, name, avatar, grade, school, subject label, and role label are returned

#### Scenario: Private assessment fields are hidden
- **WHEN** an assessment report is viewed by a student, teacher recipient, or public share token
- **THEN** the response excludes phone numbers, id card values, OpenID values, raw auth metadata, collection metadata, internal audit metadata, and teacher-only private notes

### Requirement: Assessment Events Can Be Scoped To Programs Or Sessions
Assessment records SHALL optionally link to a learning program, learning session, or report event so per-session and program-level assessment reporting can coexist.

#### Scenario: Session assessment records scope to actual attendance
- **WHEN** a teacher creates an assessment for a session-level report event
- **THEN** the system validates the teacher and student against the session participation records before allowing submission

#### Scenario: Program assessment records scope to program membership
- **WHEN** a teacher creates a program-level assessment report
- **THEN** the system validates teacher assignment and student enrollment through program-level participation records before allowing submission
