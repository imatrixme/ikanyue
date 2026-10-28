## ADDED Requirements

### Requirement: Projects Expose Unit Tests
The Taro mini program, the Go business server (`kanyue.server`), the Go payment gateway (`kanyue.pay`), the standalone admin, and the official website SHALL each include unit tests for project-owned logic that run without platform simulators or external production services.

#### Scenario: Taro unit tests run locally
- **WHEN** a developer runs the Taro unit test command from `ikanyue.taro3`
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
The Taro mini program, standalone admin, and official website SHALL each expose an independent coverage command reporting lines, branches, functions, and statements; the Go projects SHALL report statement coverage, the only metric Go tooling measures.

#### Scenario: Project coverage is available
- **WHEN** each project coverage command is run from its own directory
- **THEN** each command produces an auditable report without adding a root JavaScript workspace

#### Scenario: Taro coverage is available
- **WHEN** a developer runs the Taro submodule's coverage command from `ikanyue.taro3`
- **THEN** coverage output is produced for the tested Taro code.

#### Scenario: Go coverage is available
- **WHEN** a developer runs `GOMAXPROCS=1 TZ=Asia/Shanghai go test -p 1 -parallel 1 -coverprofile=cover.out ./...` followed by `go tool cover -func=cover.out` from `kanyue.server` or `kanyue.pay`
- **THEN** per-function and total statement coverage is reported

#### Scenario: Admin coverage is available
- **WHEN** a developer runs the admin project's coverage command from `ikanyue.admin`
- **THEN** coverage output is produced for tested React, API-client, state, and workflow code.

### Requirement: Calendar Coverage Gate
Affected Admin and Taro calendar code SHALL provide repeatable coverage commands enforcing at least 95% line, branch, function, and statement coverage independently in each affected project; the server-side calendar behavior SHALL be covered by `kanyue.server` Go tests with reported statement coverage.

#### Scenario: Server calendar behavior is tested
- **WHEN** `GOMAXPROCS=1 TZ=Asia/Shanghai go test -p 1 -parallel 1 ./...` runs in `kanyue.server`
- **THEN** the calendar, schedule, and lesson command tests pass

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
- **THEN** the exact command and measured percentages are reported for each affected project

### Requirement: Project Coverage Gates
The change SHALL prove 90%+ coverage for every affected JavaScript subproject using that subproject's own test command, and SHALL report Go statement coverage for affected Go projects.

#### Scenario: Taro coverage gate passes
- **WHEN** `pnpm run test:coverage` runs in `ikanyue.taro3`
- **THEN** the command passes with at least 90% branch coverage and reports the measured line, branch, function, and statement coverage

#### Scenario: Go server tests pass with reported coverage
- **WHEN** `GOMAXPROCS=1 TZ=Asia/Shanghai go test -p 1 -parallel 1 -coverprofile=cover.out ./...` followed by `go tool cover -func=cover.out` runs in `kanyue.server`
- **THEN** the tests pass and the total statement coverage is reported

#### Scenario: Admin coverage gate passes
- **WHEN** `npm run test:coverage` runs in `ikanyue.admin`
- **THEN** the command passes with at least 90% line, branch, function, and statement coverage

### Requirement: Project Build and E2E Gates
The change SHALL include repeatable build and workflow verification for the affected subprojects.

#### Scenario: Taro build and runtime verification pass
- **WHEN** `pnpm run build:weapp` and the miniapp runtime verification script run in `ikanyue.taro3`
- **THEN** both commands pass and cover the registered page entry points

#### Scenario: Go server static checks pass
- **WHEN** `gofmt -l .`, `GOMAXPROCS=1 go vet -p 1 ./...`, and the migration tests run in `kanyue.server`
- **THEN** all commands pass and an empty data directory reaches the full schema through `kanyue-server migrate up`

#### Scenario: Admin build and E2E pass
- **WHEN** `npm run lint`, `npm run build:server`, and `npm run test:e2e` run in `ikanyue.admin`
- **THEN** all commands pass and E2E covers login, content editing, and role gating

## MODIFIED Requirements

### Requirement: Booking Concurrency and Transaction Coverage
`kanyue.server` SHALL test the appointment transaction kernel, time-claim uniqueness, rollback, cancellation, rescheduling, expiry, and idempotency at both pure-planning and embedded-PocketBase transaction levels.

#### Scenario: Competing confirmations are tested
- **WHEN** two confirmation plans target an overlapping teacher or student time cell
- **THEN** tests prove that no valid outcome can commit duplicate active claims and that a failed command leaves no partial session or lesson-hour movement

## REMOVED Requirements

### Requirement: Subprojects expose unit tests
**Reason**: Its scenarios named the deleted Hono service and its npm commands.
**Migration**: See "Projects Expose Unit Tests".

### Requirement: Subprojects expose coverage commands
**Reason**: Its scenarios named the deleted Hono service and its npm commands.
**Migration**: See "Projects Expose Coverage Commands".

### Requirement: Ninety Percent Coverage Gate
**Reason**: Its scenarios named the deleted Hono service and its npm commands.
**Migration**: See "Calendar Coverage Gate".

### Requirement: Lightweight Loop Coverage Gates
**Reason**: Its scenarios named the deleted Hono service and its npm commands.
**Migration**: See "Project Coverage Gates".

### Requirement: Lightweight Loop Build and E2E Gates
**Reason**: Its scenarios named the deleted Hono service and its npm commands.
**Migration**: See "Project Build and E2E Gates".
