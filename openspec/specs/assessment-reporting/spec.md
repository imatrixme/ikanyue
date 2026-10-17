# assessment-reporting Specification

## Purpose
Define flexible vocal assessment templates, assessment records, immutable report snapshots, and public share links while keeping searchable business fields separate from extensible JSON content.
## Requirements
### Requirement: Versioned Assessment Templates
The system SHALL support versioned assessment templates containing sections, items, scoring rules, and report display metadata.

#### Scenario: Template draft can be created
- **WHEN** an administrator creates an assessment template draft with valid sections, items, and scoring metadata
- **THEN** the system stores the template as a draft version

#### Scenario: Invalid template is rejected
- **WHEN** a template has duplicate keys, unsupported item types, invalid weights, missing required scoring rules, or malformed report metadata
- **THEN** the system rejects the template with validation errors

#### Scenario: Template publish freezes version
- **WHEN** an administrator publishes a valid assessment template
- **THEN** the system marks that version as published and preserves it for future assessment records

### Requirement: Assessment Records
The system SHALL allow authorized teachers and administrators to create drafts, save answers, and submit assessment records for students.

#### Scenario: Teacher creates assessment for assigned student
- **WHEN** a teacher creates an assessment record for an assigned student using a published template
- **THEN** the system creates a draft record with searchable `studentId`, `teacherId`, `templateId`, `templateVersion`, and `status` fields

#### Scenario: Teacher cannot assess unrelated student
- **WHEN** a teacher creates or submits an assessment for a student outside their assignment scope
- **THEN** the system rejects the operation

#### Scenario: Submission computes score
- **WHEN** an authorized user submits a complete assessment record
- **THEN** the system validates answers, computes section scores, total score, grade, and score detail JSON

### Requirement: Report Snapshots
Submitted assessments SHALL generate immutable report snapshots for student and share-link viewing.

#### Scenario: Snapshot preserves report content
- **WHEN** an assessment record is submitted
- **THEN** the system stores student snapshot, teacher snapshot, template snapshot, answers snapshot, score snapshot, and report JSON

#### Scenario: Template changes do not rewrite historical reports
- **WHEN** an assessment template is edited or a new version is published after report generation
- **THEN** existing report snapshots continue to render using their stored snapshot data

### Requirement: Share Links
The system SHALL provide revocable, expirable share links for assessment reports without exposing internal identifiers or private student data.

#### Scenario: Share token returns report snapshot
- **WHEN** a valid, unexpired, unrevoked share token is opened
- **THEN** the system returns only the public report snapshot fields

#### Scenario: Revoked or expired share token is denied
- **WHEN** a revoked, expired, malformed, or unknown share token is opened
- **THEN** the system rejects the request

#### Scenario: Share response excludes private data
- **WHEN** a report is viewed through a share token
- **THEN** the response excludes phone numbers, OpenID values, raw auth metadata, internal audit metadata, and teacher-only private notes

### Requirement: Assessment Data Storage Shape
The system SHALL store searchable assessment and report fields separately from flexible JSON content.

#### Scenario: Searchable fields are first-class
- **WHEN** assessment records and reports are listed in the admin system
- **THEN** filters can use first-class fields such as student, teacher, template, status, total score, grade, submitted time, and share state

#### Scenario: Flexible content remains JSON
- **WHEN** answers, score traces, template sections, or report display content vary by assessment type
- **THEN** the system stores that flexible content in JSON fields while preserving validation and snapshot semantics

### Requirement: Student-Owned Report Access
The system SHALL allow authenticated students to list and view only their own report snapshots through student-facing APIs while keeping teacher/admin operations under `/ops/*`.

#### Scenario: Student lists own reports
- **WHEN** an authenticated student requests their assessment report list
- **THEN** the system returns only report summaries whose `studentId` belongs to that student

#### Scenario: Student opens own report
- **WHEN** an authenticated student requests one of their own report snapshots
- **THEN** the system returns the same privacy-safe report payload used by public share-link viewing

#### Scenario: Student cannot open another student's report
- **WHEN** an authenticated student requests a report snapshot for a different student
- **THEN** the system rejects the request without returning report content

#### Scenario: Ops boundaries remain separate
- **WHEN** student-facing report APIs are added
- **THEN** they live under `/v1/*` student-authenticated routes and do not accept `/ops/*` teacher/admin session tokens as student ownership proof

### Requirement: Ops Report Detail
The assessment reporting system SHALL provide authorized admin report detail reads through `/ops/*` while preserving the existing public share and student-owned report projections.

#### Scenario: Authorized ops user views report detail
- **WHEN** an authorized teacher or administrator opens a report they are allowed to inspect
- **THEN** the API returns a privacy-safe report detail payload containing score, sections, comments, recommendations, generated time, and student/teacher summary

#### Scenario: Unauthorized ops user is denied report detail
- **WHEN** a teacher requests a report outside their assignment scope
- **THEN** the API rejects the request and does not leak report content

### Requirement: Report Detail UI
The admin UI SHALL render report details from the ops report projection without relying on raw PocketBase records.

#### Scenario: Admin report detail renders sparse report
- **WHEN** the report payload lacks optional comments, section max scores, or recommendations
- **THEN** the UI still renders the score, grade, report identifiers, and generated time without crashing

#### Scenario: Admin report detail excludes private data
- **WHEN** a report detail contains student or teacher snapshots
- **THEN** the UI only renders fields present in the privacy-safe projection and does not display phone numbers, OpenID values, raw auth metadata, or token fields

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

