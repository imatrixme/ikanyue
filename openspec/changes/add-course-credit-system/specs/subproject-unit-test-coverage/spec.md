## MODIFIED Requirements

### Requirement: Subprojects expose unit tests
The Taro mini program, Hono API, standalone admin, and official website projects SHALL each include unit tests for project-owned course-credit logic that run without platform simulators or external production services.

#### Scenario: Taro unit tests run locally
- **WHEN** a developer runs the Taro unit test command from `ikanyue.taro3`
- **THEN** the test runner covers course-credit presentation, conversion, activation, expiry, and lesson eligibility logic without requiring WeChat DevTools

#### Scenario: Hono unit tests run locally
- **WHEN** a developer runs the Hono unit test command from `ikanyue.mapi.hono`
- **THEN** the test runner covers domain, API, PocketBase-hook contract, rollback, concurrency, idempotency, and authorization logic without a production service

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

### Requirement: Ninety Percent Coverage Gate
Every affected project MUST enforce at least 95% line, branch, function, and statement coverage, and the command MUST fail when any individual metric is below 95%.

#### Scenario: Hono or PocketBase hook coverage is below threshold
- **WHEN** any Hono or version-controlled PocketBase hook coverage metric is below 95%
- **THEN** the backend coverage command fails

#### Scenario: Admin coverage is below threshold
- **WHEN** any affected Admin coverage metric is below 95%
- **THEN** the Admin coverage command fails

#### Scenario: Taro coverage is below threshold
- **WHEN** any affected mini-program coverage metric is below 95%
- **THEN** the Taro coverage command fails

#### Scenario: Website coverage is below threshold
- **WHEN** any affected website coverage metric is below 95%
- **THEN** the website coverage command fails

### Requirement: Critical Domain Failure Coverage
The course-credit transaction kernel MUST include unit or integration coverage for success, validation failure, authorization failure, duplicate command, transaction rollback, concurrent reservation, expiry boundary, reversal, and reconciliation drift paths.

#### Scenario: Happy paths alone reach numeric threshold
- **WHEN** numeric coverage reaches 95% but a required critical failure category has no test
- **THEN** the release verification remains failed until that category is covered

### Requirement: Coverage Scope Is Reported
Coverage evidence SHALL state the exact commands, included source scope, exclusions, and measured line, branch, function, and statement percentages for every affected project.

#### Scenario: Coverage results are auditable
- **WHEN** implementation is complete
- **THEN** final verification lists the four project commands and confirms every metric is at least 95%
