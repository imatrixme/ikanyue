## ADDED Requirements

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
