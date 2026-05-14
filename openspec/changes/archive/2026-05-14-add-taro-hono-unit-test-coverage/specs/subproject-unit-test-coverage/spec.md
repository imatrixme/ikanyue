## ADDED Requirements

### Requirement: Subprojects expose unit tests
The Taro mini program and Hono API submodules SHALL each include unit tests for project-owned logic that can run without platform simulators or external services.

#### Scenario: Taro unit tests run locally
- **WHEN** a developer runs the Taro submodule's unit test command from `ikanyue.taro3`
- **THEN** the test runner completes using local project files and does not require WeChat DevTools.

#### Scenario: Hono unit tests run locally
- **WHEN** a developer runs the Hono submodule's unit test command from `ikanyue.mapi.hono`
- **THEN** the test runner completes using local project files and does not require PocketBase or a production server.

### Requirement: Subprojects expose coverage commands
The Taro mini program and Hono API submodules SHALL each expose a coverage command that reports coverage for the unit tests in that submodule.

#### Scenario: Taro coverage is available
- **WHEN** a developer runs the Taro submodule's coverage command from `ikanyue.taro3`
- **THEN** coverage output is produced for the tested Taro code.

#### Scenario: Hono coverage is available
- **WHEN** a developer runs the Hono submodule's coverage command from `ikanyue.mapi.hono`
- **THEN** coverage output is produced for the tested Hono code.

### Requirement: Parent monorepo remains dependency-neutral
The parent repository MUST NOT add a root JavaScript workspace or root package manager lockfile as part of adding these tests.

#### Scenario: Root repository stays neutral
- **WHEN** the change is applied
- **THEN** test dependencies and test scripts are declared only inside the affected submodules.
