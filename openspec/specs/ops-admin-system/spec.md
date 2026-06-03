# ops-admin-system Specification

## Purpose
Define the teacher/admin-only operations system boundary, including the `/ops/*` API surface, standalone admin UI responsibilities, authorization model, audit requirements, and first-phase management workflows.

## Requirements
### Requirement: Dedicated Ops API Authentication
The system SHALL provide a dedicated `/ops/auth/login` flow that authenticates only verified, unblocked teachers and administrators.

#### Scenario: Teacher login succeeds
- **WHEN** a verified, unblocked teacher submits valid credentials to `/ops/auth/login`
- **THEN** the system returns an ops session token and a profile with `role` equal to `teacher` or `admin`

#### Scenario: Student login is rejected
- **WHEN** a student credential or unknown credential is submitted to `/ops/auth/login`
- **THEN** the system rejects the request without creating a student account

#### Scenario: Blocked or unverified teacher is rejected
- **WHEN** a blocked or unverified teacher submits credentials to `/ops/auth/login`
- **THEN** the system rejects the request and does not issue an ops session token

### Requirement: Role-Based Operations Authorization
The Ops API SHALL enforce server-side role and ownership checks for every management operation.

#### Scenario: Teacher accesses assigned student data
- **WHEN** a teacher requests a student or assessment assigned through `teacher_student_relations`
- **THEN** the system allows access to the permitted management view

#### Scenario: Teacher is denied unrelated student data
- **WHEN** a teacher requests a student, assessment, report, or share link outside their assignment scope
- **THEN** the system rejects the request with an authorization error

#### Scenario: Administrator can manage global resources
- **WHEN** an administrator performs teacher, student, activity, material, operation-slot, assessment-template, report, or share-link management
- **THEN** the system allows the operation after validating referenced records and workflow state

### Requirement: First-Phase Information Management Modules
The admin system SHALL expose first-phase management modules for dashboard, students, teachers, activities, materials, miniapp operation slots, assessments, reports, share links, and audit logs.

#### Scenario: Dashboard aggregates operational data
- **WHEN** an authorized teacher or administrator opens the dashboard
- **THEN** the system returns operational counts and pending work scoped to that user role

#### Scenario: Management modules provide list and detail views
- **WHEN** an authorized user opens a first-phase module
- **THEN** the system provides list and detail data through `/ops/*` APIs without direct PocketBase access from the browser

#### Scenario: Operation slots control mini program surfaces
- **WHEN** an administrator creates or updates miniapp operation slots and slot items
- **THEN** the system stores channel, placement, sorting, visibility, and target metadata for mini program consumption

### Requirement: Standalone SSR Admin Project
The management UI SHALL be implemented as a standalone `ikanyue.admin` project using Vite, React, Tailwind CSS, shadcn-style components, and SSR-capable entrypoints.

#### Scenario: Admin app remains independent
- **WHEN** the admin app is added
- **THEN** it has its own package metadata, scripts, lockfile, tests, and build configuration without adding a root JavaScript workspace

#### Scenario: SSR entry renders the admin shell
- **WHEN** the admin server entry renders an authenticated or unauthenticated route
- **THEN** it returns deterministic HTML containing the admin shell state required for hydration

#### Scenario: Admin UI uses operations APIs
- **WHEN** the admin UI performs login, dashboard, module list, module detail, or mutation actions
- **THEN** it calls `/ops/*` APIs and does not call PocketBase directly

### Requirement: Audit Logging
The Ops API SHALL record audit logs for security-sensitive and data-changing management operations.

#### Scenario: Data-changing operation is audited
- **WHEN** an authorized user creates, updates, publishes, submits, revokes, or deletes an operations resource
- **THEN** the system stores actor, action, resource type, resource id, timestamp, and outcome metadata

#### Scenario: Rejected privileged operation is audited
- **WHEN** a user attempts a privileged operation that fails authorization
- **THEN** the system records a denied audit event without leaking sensitive data in the response

### Requirement: Core E2E Coverage
The first phase SHALL include core end-to-end tests for the admin system's most important workflows.

#### Scenario: Admin happy path is covered
- **WHEN** e2e tests run for the admin app
- **THEN** they cover login, dashboard visibility, student management, assessment template visibility, assessment submission, report snapshot visibility, and share-link viewing

#### Scenario: Authorization failure path is covered
- **WHEN** e2e tests run for the admin app
- **THEN** they cover at least one teacher account being denied admin-only management navigation
