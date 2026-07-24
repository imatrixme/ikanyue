## MODIFIED Requirements

### Requirement: Role-Based Operations Authorization
The Ops API SHALL enforce server-side role, ownership, and capability checks for every management operation, including course catalog, pricing, automatic enrollment, teaching, manual attendance, settlement, teacher workload, points, rewards, and audit.

#### Scenario: Teacher accesses assigned student data
- **WHEN** a teacher requests an assigned student, class, lesson, attendance roster, or personal workload
- **THEN** the system allows only the permitted teaching view and actions

#### Scenario: Teacher is denied unrelated or financial data
- **WHEN** a teacher requests unrelated students, package prices, lesson-hour account adjustments, points, rewards, or global audit
- **THEN** the system rejects the request with an authorization error

#### Scenario: Administrator can manage global resources
- **WHEN** an administrator performs student, course, package, enrollment, class, lesson, settlement, teacher-workload, points, reward, or audit management
- **THEN** the system allows the operation after validating references, capability, workflow state, idempotency, and required confirmation

### Requirement: First-Phase Information Management Modules
The admin system SHALL expose routed first-phase modules for dashboard, students, courses, packages and pricing, enrollment orders, classes, lessons, lesson-hour accounts, teacher workload, exceptions, audit logs, points, and rewards.

#### Scenario: Dashboard aggregates operational data
- **WHEN** an authorized operator opens the dashboard
- **THEN** the system returns scoped counts for today's lessons, pending enrollment synchronization, insufficient lesson hours, unsettled lessons, expiring hours, pending teacher workload, and operational exceptions

#### Scenario: Management modules provide list and detail views
- **WHEN** an authorized user opens a first-phase module
- **THEN** the system provides URL-addressable list data and drawer/dialog detail through `/ops/*` APIs without direct PocketBase browser access

#### Scenario: Existing lightweight modules remain available
- **WHEN** an administrator opens points or rewards after the course modules are enabled
- **THEN** the existing points and offline physical-reward workflows remain functional

### Requirement: Core E2E Coverage
The first phase SHALL include core end-to-end tests for the Admin system's highest-value and highest-risk workflows.

#### Scenario: Admin happy path is covered
- **WHEN** Admin workflow tests run
- **THEN** they cover login, routed navigation, course/package visibility, automatic enrollment, class membership, lesson publication, manual attendance, settlement preview, settlement, student course visibility, points, and rewards

#### Scenario: Authorization failure path is covered
- **WHEN** Admin workflow tests run
- **THEN** they cover a teacher being denied pricing, lesson-hour adjustment, unrelated student, points, rewards, and global audit actions

#### Scenario: Exception and correction path is covered
- **WHEN** Admin workflow tests run
- **THEN** they cover insufficient lesson hours, failed future-roster synchronization, duplicate enrollment, settlement failure, and post-settlement correction

