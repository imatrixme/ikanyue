## ADDED Requirements

### Requirement: Student Credit Summary
The mini program SHALL show the authenticated student's universal credits and each course-specific credit type with available, frozen, unactivated, and nearest-expiry quantities.

#### Scenario: Universal credit is displayed
- **WHEN** a student has universal credits
- **THEN** the mini program labels them as exchange-only and does not present them as directly usable lesson credits

#### Scenario: Batch is nearing expiry
- **WHEN** a batch falls within the configured expiry-warning window
- **THEN** the student summary highlights the quantity and effective expiry date

### Requirement: Student Conversion Confirmation
The mini program SHALL display authoritative conversion preview data before explicit or implicit conversion.

#### Scenario: Student reviews conversion
- **WHEN** a student previews `1 A -> 2 B`
- **THEN** the page shows source and target quantities, expiry behavior, activation behavior, reversibility, and the active rule version summary

### Requirement: Lesson Eligibility Visibility
The mini program SHALL show whether a student is reserved, requires conversion, lacks credit, or has settled for each relevant lesson.

#### Scenario: Student lacks matching credit
- **WHEN** a lesson cannot be covered
- **THEN** the page explains the required course type and available conversion path without claiming the student has been charged

### Requirement: Structured Admin Workspaces
The Admin application SHALL provide separate structured workspaces for course catalog, packages and pricing, credit accounts and batches, conversion rules, classes, sessions, settlement exceptions, teacher credits, and audit.

#### Scenario: Operator opens student credit detail
- **WHEN** an authorized operator selects a student from the account table
- **THEN** details and high-risk actions open in a dialog or drawer without replacing the primary workspace context

#### Scenario: Operator previews a high-risk mutation
- **WHEN** an operator extends, converts, reverses, or settles credits
- **THEN** Admin shows affected batches, quantities, expiry, sessions, reason, and confirmation before submitting

### Requirement: Public Website Boundary
The website SHALL expose only published public course and package projections and SHALL NOT expose student balances, class rosters, private orders, or teacher earnings.

#### Scenario: Public package page is requested
- **WHEN** a visitor opens a published package
- **THEN** the website shows public price and validity information without private account fields

### Requirement: Role-Scoped Access
All course-credit APIs and interfaces SHALL enforce role and ownership on the server.

#### Scenario: Student requests another student's batches
- **WHEN** an authenticated student attempts to address another student id
- **THEN** the server rejects the request and records an authorization audit event

#### Scenario: Student reserves another roster entry
- **WHEN** an authenticated student submits a reservation for a `session_student` owned by another student
- **THEN** the Hono service rejects the command using only the authenticated student identity and does not send a PocketBase batch

#### Scenario: Teacher requests unrelated financial data
- **WHEN** a teacher without financial permission requests package cost basis or another teacher's earnings
- **THEN** the server denies access

### Requirement: Asynchronous Notifications
The system SHALL enqueue purchase, activation, expiry, conversion, eligibility, cancellation, consumption, and teacher-credit notifications after the related transaction commits.

#### Scenario: Notification delivery fails
- **WHEN** a subscription message provider is unavailable after a successful ledger operation
- **THEN** the ledger result remains committed and the outbox retries notification delivery
