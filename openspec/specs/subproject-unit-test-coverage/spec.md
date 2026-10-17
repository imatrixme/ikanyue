# subproject-unit-test-coverage Specification

## Purpose
Define local unit-test and coverage expectations for independent Kanyue subprojects, including the Taro mini program, Hono API service, and standalone admin application, while keeping the parent repository dependency-neutral.
## Requirements
### Requirement: Subprojects expose unit tests
The Taro mini program, Hono API, standalone admin, and official website projects SHALL each include unit tests for project-owned course-credit logic that run without platform simulators or external production services.

#### Scenario: Taro unit tests run locally
- **WHEN** a developer runs the Taro unit test command from `ikanyue.taro3`
- **THEN** the test runner covers course-credit presentation, conversion, activation, expiry, and lesson eligibility logic without requiring WeChat DevTools

#### Scenario: Hono unit tests run locally
- **WHEN** a developer runs the Hono unit test command from `ikanyue.mapi.hono`
- **THEN** the test runner covers domain, API, PocketBase SDK batch repository, rollback, concurrency, idempotency, and authorization logic without a production service

#### Scenario: Admin unit tests run locally
- **WHEN** a developer runs the admin unit test command from `ikanyue.admin`
- **THEN** the test runner covers catalog, batch, conversion, class, session, settlement, teacher-credit, and high-risk confirmation workflows

#### Scenario: Website unit tests run locally
- **WHEN** a developer runs the website unit test command from `ikanyue.website`
- **THEN** the test runner covers public projections and private-field exclusion without production APIs

### Requirement: Subprojects expose coverage commands
The Taro mini program, Hono API, standalone admin, and official website projects SHALL each expose an independent coverage command reporting lines, branches, functions, and statements.

#### Scenario: Four-project coverage is available
- **WHEN** each project coverage command is run from its own repository
- **THEN** each command produces an auditable report for all four coverage metrics without adding a root JavaScript workspace

#### Scenario: Taro coverage is available
- **WHEN** a developer runs the Taro submodule's coverage command from `ikanyue.taro3`
- **THEN** coverage output is produced for the tested Taro code.

#### Scenario: Hono coverage is available
- **WHEN** a developer runs the Hono submodule's coverage command from `ikanyue.mapi.hono`
- **THEN** coverage output is produced for the tested Hono code.

#### Scenario: Admin coverage is available
- **WHEN** a developer runs the admin project's coverage command from `ikanyue.admin`
- **THEN** coverage output is produced for tested React, SSR, API-client, state, and workflow code.

### Requirement: Parent monorepo remains dependency-neutral
The parent repository MUST NOT add a root JavaScript workspace or root package manager lockfile as part of adding these tests.

#### Scenario: Root repository stays neutral
- **WHEN** the change is applied
- **THEN** test dependencies and test scripts are declared only inside the affected submodules or standalone project directories.

### Requirement: Ninety Percent Coverage Gate
Affected Hono, Admin, and Taro calendar code SHALL provide repeatable coverage commands enforcing at least 95% line, branch, function, and statement coverage independently in each affected project.

#### Scenario: Hono coverage threshold is enforced
- **WHEN** the course calendar Hono coverage command runs from `ikanyue.mapi.hono`
- **THEN** it fails if covered calendar source lines, branches, functions, or statements fall below 95%

#### Scenario: Admin coverage threshold is enforced
- **WHEN** the Admin coverage command runs from `ikanyue.admin`
- **THEN** it fails if covered calendar React, API-client, state, helper, or workflow lines, branches, functions, or statements fall below 95%

#### Scenario: Taro coverage threshold is enforced
- **WHEN** the Taro coverage command runs from `ikanyue.taro3`
- **THEN** it fails if covered calendar page logic, role logic, API adapter, or shared component logic lines, branches, functions, or statements fall below 95%

#### Scenario: Website coverage is below threshold
- **WHEN** any affected website coverage metric is below 95%
- **THEN** the website coverage command fails

#### Scenario: Coverage evidence is reported independently
- **WHEN** implementation verification is complete
- **THEN** the exact command and measured lines, branches, functions, and statements percentages are reported for each affected project

### Requirement: Coverage Scope Is Reported
Coverage evidence SHALL state the exact commands, included source scope, exclusions, and measured line, branch, function, and statement percentages for every affected project.

#### Scenario: Coverage results are auditable
- **WHEN** implementation is complete
- **THEN** final verification lists the four project commands and confirms every metric is at least 95%

### Requirement: Lightweight Loop Coverage Gates
The change SHALL prove 90%+ coverage for every affected subproject using that subproject's own test command.

#### Scenario: Taro coverage gate passes
- **WHEN** `pnpm run test:coverage` runs in `ikanyue.taro3`
- **THEN** the command passes with at least 90% branch coverage and reports the measured line, branch, function, and statement coverage

#### Scenario: Hono coverage gate passes
- **WHEN** `npm run test:coverage` runs in `ikanyue.mapi.hono`
- **THEN** the command passes with at least 90% line, branch, and function coverage

#### Scenario: Admin coverage gate passes
- **WHEN** `npm run test:coverage` runs in `ikanyue.admin`
- **THEN** the command passes with at least 90% line, branch, function, and statement coverage

### Requirement: Lightweight Loop Build and E2E Gates
The change SHALL include repeatable build and workflow verification for the affected subprojects.

#### Scenario: Taro build and runtime verification pass
- **WHEN** `pnpm run build:weapp` and the miniapp runtime verification script run in `ikanyue.taro3`
- **THEN** both commands pass and cover signup, personal content, report, and operation-slot entry points

#### Scenario: Hono schema and Swagger gates pass
- **WHEN** `npm run ops:schema:check`, `npm run lint`, and `npm run swagger:build` run in `ikanyue.mapi.hono`
- **THEN** all commands pass and generated Swagger includes the signup and report APIs touched by this change

#### Scenario: Admin build and E2E pass
- **WHEN** `npm run lint`, `npm run build`, and `npm run test:e2e` run in `ikanyue.admin`
- **THEN** all commands pass and E2E covers login, publishable content editing, signup review, report detail, share preview, and role gating

### Requirement: Guided Admin Coverage
The admin project SHALL cover guided operations workflow logic and UI with focused tests under its existing coverage gate.

#### Scenario: Admin coverage includes guided logic
- **WHEN** `npm run test:coverage` is run from `ikanyue.admin`
- **THEN** coverage includes guided workflow definitions, generated-plan logic, and guided dialog components while enforcing the existing 90% line, branch, function, and statement thresholds

#### Scenario: Verification reports concrete commands
- **WHEN** implementation is complete
- **THEN** verification evidence includes the admin commands used for unit tests, coverage, build, lint, and OpenSpec validation

### Requirement: Scene Workflow Coverage
The admin project SHALL cover scene workspace derivation, context-locked relation actions, and document editor behavior under the existing coverage gate.

#### Scenario: Scene derivation is covered
- **WHEN** admin unit tests run
- **THEN** tests verify that project and lesson scenes can be reconstructed from loaded resources without losing project, lesson, student, teacher, attendance, and relation status information

#### Scenario: Relation payload generation is covered
- **WHEN** admin unit tests run
- **THEN** tests verify that project-student, project-teacher, lesson-student, and lesson-teacher scene actions generate payloads with the locked parent identifier and selected child identifiers

#### Scenario: Context locking is covered
- **WHEN** admin component tests run
- **THEN** tests verify that known project and lesson context are displayed as locked context instead of editable generic relation selectors

#### Scenario: Document editor modes are covered
- **WHEN** admin component tests run
- **THEN** tests verify that the document editor modal can switch between edit, preview, split, Markdown, and HTML-oriented review modes while preserving draft content

#### Scenario: Verification reports scene commands
- **WHEN** implementation is complete
- **THEN** verification evidence includes the admin commands used for tests, coverage, lint, build, and OpenSpec validation

### Requirement: Admin Scene UX Tests
The admin project SHALL include focused tests for the refined scene workflow UX under the existing local test and coverage commands.

#### Scenario: Scene locators are covered
- **WHEN** admin component tests run
- **THEN** they verify that project and lesson workspaces use step-based object location rather than native dropdown selection

#### Scenario: Locked context is covered
- **WHEN** admin component tests run
- **THEN** they verify that selecting a project or lesson locks that context for subsequent relation actions

#### Scenario: Document editor ownership is covered
- **WHEN** admin component tests run
- **THEN** they verify that long-form fields open a single document editor sheet and return saved content to the originating form or guided workflow

#### Scenario: Navigation hierarchy is covered
- **WHEN** admin component tests run
- **THEN** they verify that ordinary operators see scene workspaces before advanced relation maintenance paths

### Requirement: Admin Role And Scene Workflow Tests
The admin project SHALL include focused tests for role-specific dashboards, direct scene entry, context recovery, focused relation actions, and TanStack-backed data maintenance tables.

#### Scenario: Role dashboard behavior is covered
- **WHEN** admin component and app flow tests run
- **THEN** they verify that administrators see an operations cockpit and teachers see a task-oriented teaching dashboard

#### Scenario: Teacher access boundary is covered
- **WHEN** app permission and app flow tests run
- **THEN** they verify that non-admin teachers cannot access administrator maintenance views such as teachers, templates, report events, audit logs, system settings, guided operations, and raw relation tables

#### Scenario: Direct scene entry is covered
- **WHEN** project and lesson scene workspace tests run with available data
- **THEN** they verify that the locked workspace appears without an initial setup modal

#### Scenario: Context recovery is covered
- **WHEN** scene workspace tests run
- **THEN** they verify that the operator can open the setup modal from a change-context action and confirm another project or lesson without submitting relation changes

#### Scenario: Focused relation actions are covered
- **WHEN** scene action tests run
- **THEN** they verify that single-screen right-side action sheets preserve locked context, selected people, action state, and relation payloads

#### Scenario: Data maintenance table behavior is covered
- **WHEN** shared UI tests run
- **THEN** they verify that the TanStack-backed data table renders rows, empty states, filtering, sorting affordances, row selection, and image/status cells

### Requirement: Admin Human Workflow UX Tests
The admin project SHALL include focused tests for lifecycle navigation, role work queues, guided motive grouping, business-facing labels, and data-center separation under the existing local test and coverage commands.

#### Scenario: Lifecycle navigation is covered
- **WHEN** admin component or app-flow tests run
- **THEN** they verify that administrator navigation exposes lifecycle groups and keeps low-level relation maintenance under an advanced data-center path

#### Scenario: Teacher navigation is covered
- **WHEN** admin component or app-flow tests run
- **THEN** they verify that non-admin teachers see task-oriented teaching surfaces and do not see administrator data-center maintenance destinations

#### Scenario: Dashboard work queues are covered
- **WHEN** admin dashboard tests run
- **THEN** they verify that administrator and teacher dashboards show role-scoped work queues with human-readable empty states or records

#### Scenario: Guided motive grouping is covered
- **WHEN** guided operations tests run
- **THEN** they verify that first-level workflow choices are grouped by human motive and detailed templates are secondary choices inside those groups

#### Scenario: Business labels are covered
- **WHEN** resource configuration or rendering tests run
- **THEN** they verify that ordinary UI labels translate teaching, lesson, report, and miniapp placement resources into business-facing terms

#### Scenario: Data center boundary is covered
- **WHEN** data maintenance tests run
- **THEN** they verify that advanced tables retain sorting, filtering, selection, and editing affordances while explaining their diagnostic purpose

### Requirement: Booking Concurrency and Transaction Coverage
The Hono project SHALL test the appointment transaction kernel, time-claim uniqueness, rollback, cancellation, rescheduling, expiry, and idempotency at both pure-planning and repository-contract levels.

#### Scenario: Competing confirmations are tested
- **WHEN** two confirmation plans target an overlapping teacher or student time cell
- **THEN** tests prove that no valid outcome can commit duplicate active claims and that a failed command leaves no partial session or lesson-hour movement

### Requirement: Booking UI Workflow Coverage
The Taro and Admin projects SHALL cover scene-level booking interactions rather than only rendering individual fields.

#### Scenario: Human booking workflows are tested
- **WHEN** frontend tests run
- **THEN** they cover the decisions and outcomes required to request, confirm, decline, cancel, reschedule, configure availability, resolve conflicts, and navigate into the linked lesson

### Requirement: Lite Points E2E Coverage
The release SHALL include end-to-end tests covering the critical lite points workflow without requiring Docker during normal iteration.

#### Scenario: Admin offline redemption flow is covered
- **WHEN** E2E tests run for the lite admin app
- **THEN** they cover login, student lookup, adding points, reward item management, and offline redemption deduction

#### Scenario: Student reward availability flow is covered
- **WHEN** E2E tests run for the mini program-facing reward flow
- **THEN** they cover current point display, redeemable reward display, and locked reward display

#### Scenario: Docker is reserved for release verification
- **WHEN** normal development verification is run before release approval
- **THEN** the required local gates do not require Docker compose

### Requirement: Critical Domain Failure Coverage
The course-credit transaction kernel MUST include unit or integration coverage for success, validation failure, authorization failure, duplicate command, transaction rollback, concurrent reservation, expiry boundary, reversal, and reconciliation drift paths.

#### Scenario: Happy paths alone reach numeric threshold
- **WHEN** numeric coverage reaches 95% but a required critical failure category has no test
- **THEN** the release verification remains failed until that category is covered

### Requirement: Human-Readable Course Presentation Coverage
The Admin and Taro subprojects SHALL include repeatable tests for course-operation presentation rules and semantic relationship workflows.

#### Scenario: Admin presentation mappings are tested
- **WHEN** Admin unit tests run
- **THEN** they verify known and unknown status labels, person and object identity fallbacks, money and date summaries, and suppression of serialized JSON in normal views

#### Scenario: Admin relationship workflows are tested
- **WHEN** Admin interaction tests run
- **THEN** they verify teacher, class, package, course, credit-type, lesson, and price choices are selected through human-readable controls while submitted payloads retain the correct identifiers

#### Scenario: Admin selected identity remains human-readable
- **WHEN** Admin roster, attendance, settlement, enrollment, account, or workload tests render selected records
- **THEN** they assert recognizable names and business context remain visible and raw identifiers are not the primary label

#### Scenario: Taro learner terminology is tested
- **WHEN** Taro unit tests run
- **THEN** they verify learner-facing balance, reservation, history, conversion, return, correction, and expiry labels without requiring WeChat DevTools

#### Scenario: Existing coverage gates remain enforced
- **WHEN** the affected subproject coverage commands run
- **THEN** this presentation and interaction logic is included without reducing the established coverage thresholds

