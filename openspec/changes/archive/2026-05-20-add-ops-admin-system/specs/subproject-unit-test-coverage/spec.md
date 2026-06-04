## MODIFIED Requirements

### Requirement: Subprojects expose unit tests
The Taro mini program, Hono API, and standalone admin submodules/projects SHALL each include unit tests for project-owned logic that can run without platform simulators or external production services.

#### Scenario: Taro unit tests run locally
- **WHEN** a developer runs the Taro submodule's unit test command from `ikanyue.taro3`
- **THEN** the test runner completes using local project files and does not require WeChat DevTools.

#### Scenario: Hono unit tests run locally
- **WHEN** a developer runs the Hono submodule's unit test command from `ikanyue.mapi.hono`
- **THEN** the test runner completes using local project files and does not require PocketBase or a production server.

#### Scenario: Admin unit tests run locally
- **WHEN** a developer runs the admin project's unit test command from `ikanyue.admin`
- **THEN** the test runner completes using local project files and does not require PocketBase, a production Hono server, or a browser-managed login session.

### Requirement: Subprojects expose coverage commands
The Taro mini program, Hono API, and standalone admin submodules/projects SHALL each expose a coverage command that reports coverage for the unit tests in that submodule or project.

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

## ADDED Requirements

### Requirement: Ninety Percent Coverage Gate
Affected Hono and admin code SHALL provide repeatable coverage commands enforcing at least 90% line, branch, and function coverage.

#### Scenario: Hono coverage threshold is enforced
- **WHEN** `npm run test:coverage` is run from `ikanyue.mapi.hono`
- **THEN** the command fails if covered Hono source lines, branches, or functions fall below 90%

#### Scenario: Admin coverage threshold is enforced
- **WHEN** the admin coverage command is run from `ikanyue.admin`
- **THEN** the command fails if covered admin source lines, branches, or functions fall below 90%

### Requirement: Coverage Scope Is Reported
Coverage evidence SHALL state the concrete commands and measured coverage for every affected project.

#### Scenario: Coverage results are auditable
- **WHEN** implementation is complete
- **THEN** the final verification output includes the commands run and the measured Hono and admin coverage percentages
