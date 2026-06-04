## ADDED Requirements

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
