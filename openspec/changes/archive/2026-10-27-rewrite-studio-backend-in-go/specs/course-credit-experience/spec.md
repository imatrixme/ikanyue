## MODIFIED Requirements

### Requirement: Role-Scoped Access
All course-credit APIs and interfaces SHALL enforce role and ownership on the server.

#### Scenario: Student requests another student's batches
- **WHEN** an authenticated student attempts to address another student id
- **THEN** the server rejects the request and records an authorization audit event

#### Scenario: Student reserves another roster entry
- **WHEN** an authenticated student submits a booking that names another student
- **THEN** `kanyue.server` derives the student only from the authenticated identity and writes nothing for the other student

#### Scenario: Teacher requests unrelated financial data
- **WHEN** a teacher without financial permission requests package cost basis or another teacher's earnings
- **THEN** the server denies access
