## ADDED Requirements

### Requirement: Routed Course Operations Workspaces
Admin SHALL provide stable URL routes for dashboard, students, courses, packages and prices, enrollments, classes, lessons, lesson-hour accounts, teacher workload, exceptions, audit, points, and rewards.

#### Scenario: Operator opens a detail drawer
- **WHEN** the operator opens a student, package, class, lesson, or account detail
- **THEN** the list route and filters remain active while detail appears in a drawer or dialog

### Requirement: Course Catalog Management
Authorized finance or admin operators SHALL create, edit, activate, and deactivate course specifications, packages, grant lines, and price versions through explicit Hono commands.

#### Scenario: Operator publishes a package
- **WHEN** all course-hour grant lines, price, activation, and validity fields pass validation
- **THEN** the package becomes available to the Admin enrollment workflow without direct PocketBase browser access

### Requirement: Student Course Workspace
The student detail SHALL combine profile, enrolled courses, class memberships, lesson history, existing points, and audit context without exposing unrelated students.

#### Scenario: Operator starts enrollment from a student
- **WHEN** an authorized operator selects “报课” from student detail
- **THEN** Admin opens the enrollment workflow with the student preselected

### Requirement: Class and Lesson Management
Authorized academic operators SHALL manage class membership, teacher assignments, lesson creation, publication, roster snapshots, rescheduling, cancellation, and actual teachers.

#### Scenario: Lesson is published
- **WHEN** an operator publishes a lesson linked to one or more classes
- **THEN** the system snapshots a deduplicated roster and evaluates each student's lesson-hour eligibility

### Requirement: Capability-Scoped Navigation
Admin SHALL derive visible routes and allowed actions from server-provided capabilities and SHALL still rely on Hono for authoritative authorization.

#### Scenario: Teacher opens Admin
- **WHEN** a teacher has only assigned-teaching capabilities
- **THEN** Admin shows assigned students and lessons but hides prices, account adjustments, global audit, points, and rewards management

### Requirement: Existing Points and Rewards Preservation
The existing student points and physical reward workflows SHALL remain available to authorized administrators after course operations are added.

#### Scenario: Administrator opens points
- **WHEN** the new routed shell is active
- **THEN** the existing points addition and offline reward redemption workflows remain functional

