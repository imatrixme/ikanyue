## MODIFIED Requirements

### Requirement: Role-Based Operations Authorization
The Ops API SHALL enforce server-side role, ownership, and capability checks for every management operation, including course catalog, pricing, credit, conversion, teaching, settlement, and teacher-credit actions.

#### Scenario: Teacher accesses assigned student data
- **WHEN** a teacher requests a student, class, session, attendance record, report, or teacher earning within their assignment scope
- **THEN** the system allows only the permitted teaching and personal earning view

#### Scenario: Teacher is denied unrelated student data
- **WHEN** a teacher requests a student, financial batch, conversion, report, or settlement outside their assignment and capability scope
- **THEN** the system rejects the request with an authorization error

#### Scenario: Academic operator manages teaching data
- **WHEN** an academic operator manages authorized classes, rosters, sessions, attendance, or settlement preparation
- **THEN** the system allows the operation but does not grant pricing-rule or financial-adjustment capability

#### Scenario: Administrator can manage global resources
- **WHEN** an administrator performs teacher, student, activity, material, course catalog, package, pricing, conversion, class, session, settlement, report, or audit management
- **THEN** the system allows the operation after validating references, capability, workflow state, and required confirmation

### Requirement: First-Phase Information Management Modules
The admin system SHALL retain lightweight points and content management while adding structured modules for course catalog, packages and pricing, course-credit accounts and batches, conversion rules, classes, sessions, settlement exceptions, teacher credits, and audit.

#### Scenario: Dashboard aggregates operational data
- **WHEN** an authorized operator opens the dashboard
- **THEN** the system returns scoped counts for students, expiring credits, insufficient lesson reservations, unsettled sessions, pending teacher credits, and operational exceptions

#### Scenario: Management modules provide list and detail views
- **WHEN** an authorized user opens an operations module
- **THEN** the system provides table or list data and dialog/drawer detail through `/ops/*` APIs without direct PocketBase browser access

#### Scenario: High-risk actions use command workflows
- **WHEN** an operator requests credit extension, conversion, reversal, settlement, or teacher-credit adjustment
- **THEN** the admin uses a dedicated preview and command API instead of generic record editing

#### Scenario: Operation slots control mini program surfaces
- **WHEN** an administrator creates or updates miniapp operation slots and slot items
- **THEN** the system stores channel, placement, sorting, visibility, and target metadata for mini program consumption without granting access to private course-credit data

### Requirement: Audit Logging
The Ops API SHALL record immutable audit logs for security-sensitive and data-changing operations, including before/after summaries for course-credit commands.

#### Scenario: Data-changing operation is audited
- **WHEN** an authorized user creates, updates, publishes, settles, reverses, extends, adjusts, submits, revokes, or deletes an operations resource
- **THEN** the system stores actor, role, action, resource type, resource id, operation id, trace id, reason, timestamp, outcome, and privacy-safe before/after metadata

#### Scenario: Rejected privileged operation is audited
- **WHEN** a user attempts a privileged operation that fails authorization or workflow validation
- **THEN** the system records a denied audit event without leaking sensitive data in the response

### Requirement: Core E2E Coverage
The operations system SHALL include end-to-end coverage for its existing lightweight workflows and the highest-risk course-credit workflows.

#### Scenario: Admin happy path is covered
- **WHEN** e2e tests run for the admin app
- **THEN** they cover login, student management, package publication, student batch detail, conversion preview, class/session creation, lesson settlement, teacher pending credit, report visibility, and share-link viewing

#### Scenario: Authorization failure path is covered
- **WHEN** e2e tests run for the admin app
- **THEN** they cover at least one teacher account being denied financial adjustment and unrelated student navigation

#### Scenario: Settlement exception path is covered
- **WHEN** e2e tests run for the admin app
- **THEN** they cover insufficient credit, duplicate command, expired release, and post-settlement correction workflows
