## MODIFIED Requirements

### Requirement: Booking UI Workflow Coverage
The mini program and Admin projects SHALL cover scene-level booking interactions rather than only rendering individual fields.

#### Scenario: Human booking workflows are tested
- **WHEN** frontend tests run
- **THEN** they cover the decisions and outcomes required to request, confirm, decline, cancel, reschedule, configure availability, resolve conflicts, and navigate into the linked lesson

### Requirement: Human-Readable Course Presentation Coverage
The Admin and mini program subprojects SHALL include repeatable tests for course-operation presentation rules and semantic relationship workflows.

#### Scenario: Admin presentation mappings are tested
- **WHEN** Admin unit tests run
- **THEN** they verify known and unknown status labels, person and object identity fallbacks, money and date summaries, and suppression of serialized JSON in normal views

#### Scenario: Admin relationship workflows are tested
- **WHEN** Admin interaction tests run
- **THEN** they verify teacher, class, package, course, credit-type, lesson, and price choices are selected through human-readable controls while submitted payloads retain the correct identifiers

#### Scenario: Admin selected identity remains human-readable
- **WHEN** Admin roster, attendance, settlement, enrollment, account, or workload tests render selected records
- **THEN** they assert recognizable names and business context remain visible and raw identifiers are not the primary label

#### Scenario: Mini program learner terminology is tested
- **WHEN** mini program unit tests run
- **THEN** they verify learner-facing balance, reservation, history, conversion, return, correction, and expiry labels without requiring WeChat DevTools

#### Scenario: Existing coverage gates remain enforced
- **WHEN** the affected subproject coverage commands run
- **THEN** this presentation and interaction logic is included without reducing the established coverage thresholds

### Requirement: Projects Expose Unit Tests
The native mini program (`ikanyue.mini`), the Go business server (`kanyue.server`), the Go payment gateway (`kanyue.pay`), the standalone admin, and the official website SHALL each include unit tests for project-owned logic that run without platform simulators or external production services.

#### Scenario: Mini program unit tests run locally
- **WHEN** a developer runs the unit test command from `ikanyue.mini`
- **THEN** the test runner covers course-credit presentation, conversion, activation, expiry, and lesson eligibility logic without requiring WeChat DevTools

#### Scenario: Go server tests run locally
- **WHEN** a developer runs `GOMAXPROCS=1 TZ=Asia/Shanghai go test -p 1 -parallel 1 ./...` from `kanyue.server`
- **THEN** the tests cover domain, API, embedded-PocketBase transaction, rollback, concurrency, idempotency, and authorization logic without a production service, and every former Hono business test case is either annotated `// Hono: <file> › <title>` on its Go counterpart or listed with a reason in the rewrite change's `test-parity.md`

#### Scenario: Admin unit tests run locally
- **WHEN** a developer runs the admin unit test command from `ikanyue.admin`
- **THEN** the test runner covers catalog, batch, conversion, class, session, settlement, teacher-credit, and high-risk confirmation workflows

#### Scenario: Website unit tests run locally
- **WHEN** a developer runs the website unit test command from `ikanyue.website`
- **THEN** the test runner covers public projections and private-field exclusion without production APIs

### Requirement: Projects Expose Coverage Commands
The native mini program (`ikanyue.mini`), standalone admin, and official website SHALL each expose an independent coverage command reporting lines, branches, functions, and statements; the Go projects SHALL report statement coverage, the only metric Go tooling measures.

#### Scenario: Project coverage is available
- **WHEN** each project coverage command is run from its own directory
- **THEN** each command produces an auditable report without adding a root JavaScript workspace

#### Scenario: Mini program coverage is available
- **WHEN** a developer runs the coverage command from `ikanyue.mini`
- **THEN** coverage output is produced for the tested `kit/`, `core/` and `services/` code.

#### Scenario: Go coverage is available
- **WHEN** a developer runs `GOMAXPROCS=1 TZ=Asia/Shanghai go test -p 1 -parallel 1 -coverprofile=cover.out ./...` followed by `go tool cover -func=cover.out` from `kanyue.server` or `kanyue.pay`
- **THEN** per-function and total statement coverage is reported

#### Scenario: Admin coverage is available
- **WHEN** a developer runs the admin project's coverage command from `ikanyue.admin`
- **THEN** coverage output is produced for tested React, API-client, state, and workflow code.

### Requirement: Calendar Coverage Gate
Affected Admin and mini program calendar code SHALL provide repeatable coverage commands enforcing at least 95% line, branch, function, and statement coverage independently in each affected project; the server-side calendar behavior SHALL be covered by `kanyue.server` Go tests with reported statement coverage.

#### Scenario: Server calendar behavior is tested
- **WHEN** `GOMAXPROCS=1 TZ=Asia/Shanghai go test -p 1 -parallel 1 ./...` runs in `kanyue.server`
- **THEN** the calendar, schedule, and lesson command tests pass

#### Scenario: Admin coverage threshold is enforced
- **WHEN** the Admin coverage command runs from `ikanyue.admin`
- **THEN** it fails if covered calendar React, API-client, state, helper, or workflow lines, branches, functions, or statements fall below 95%

#### Scenario: Mini program coverage threshold is enforced
- **WHEN** the coverage command runs from `ikanyue.mini`
- **THEN** it fails if covered calendar logic, role logic, API adapter, or kit logic lines, branches, functions, or statements fall below 95%

#### Scenario: Website coverage is below threshold
- **WHEN** any affected website coverage metric is below 95%
- **THEN** the website coverage command fails

#### Scenario: Coverage evidence is reported independently
- **WHEN** implementation verification is complete
- **THEN** the exact command and measured percentages are reported for each affected project

### Requirement: Project Coverage Gates
The change SHALL prove 90%+ coverage for every affected JavaScript subproject using that subproject's own test command, and SHALL report Go statement coverage for affected Go projects.

#### Scenario: Mini program coverage gate passes
- **WHEN** `pnpm run test:coverage` runs in `ikanyue.mini`
- **THEN** the command passes with at least 90% branch coverage and reports the measured line, branch, function, and statement coverage

#### Scenario: Go server tests pass with reported coverage
- **WHEN** `GOMAXPROCS=1 TZ=Asia/Shanghai go test -p 1 -parallel 1 -coverprofile=cover.out ./...` followed by `go tool cover -func=cover.out` runs in `kanyue.server`
- **THEN** the tests pass and the total statement coverage is reported

#### Scenario: Admin coverage gate passes
- **WHEN** `npm run test:coverage` runs in `ikanyue.admin`
- **THEN** the command passes with at least 90% line, branch, function, and statement coverage

### Requirement: Project Build and E2E Gates
The change SHALL include repeatable build and workflow verification for the affected subprojects.

#### Scenario: Mini program static and compile verification pass
- **WHEN** `pnpm lint` and `pnpm test` (including the template, source-boundary and contract checks) run in `ikanyue.mini` and the project compiles in WeChat DevTools
- **THEN** all checks pass and cover the registered page entry points

#### Scenario: Go server static checks pass
- **WHEN** `gofmt -l .`, `GOMAXPROCS=1 go vet -p 1 ./...`, and the migration tests run in `kanyue.server`
- **THEN** all commands pass and an empty data directory reaches the full schema through `kanyue-server migrate up`

#### Scenario: Admin build and E2E pass
- **WHEN** `npm run lint`, `npm run build:server`, and `npm run test:e2e` run in `ikanyue.admin`
- **THEN** all commands pass and E2E covers login, content editing, and role gating
