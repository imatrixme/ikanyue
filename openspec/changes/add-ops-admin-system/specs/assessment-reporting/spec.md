## ADDED Requirements

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
