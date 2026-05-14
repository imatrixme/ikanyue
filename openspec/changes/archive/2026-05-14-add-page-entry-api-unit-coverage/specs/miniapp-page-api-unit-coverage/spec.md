## ADDED Requirements

### Requirement: Page Entry Inventory
The change SHALL derive the mini program testing scope from pages registered in `ikanyue.taro3/src/app.config.js`.

#### Scenario: Registered pages are inventoried
- **WHEN** the change identifies mini program page coverage targets
- **THEN** the inventory includes registered page paths and excludes unregistered page directories

### Requirement: Page Logic Unit Coverage
The change SHALL add deterministic unit tests for request orchestration or data-flow logic behind exposed mini program pages where that logic can run without WeChat DevTools.

#### Scenario: Page-facing logic is tested locally
- **WHEN** a registered page transforms request parameters, response data, navigation input, or local state
- **THEN** the behavior is covered by Vitest tests with mocked Taro or request dependencies

### Requirement: Matching Hono Endpoint Coverage
The change SHALL add Hono tests for backend routes used by the covered mini program page flows.

#### Scenario: Page API route is covered
- **WHEN** a registered mini program page calls a Hono route through the request layer
- **THEN** the corresponding route behavior is covered by local Node tests without live PocketBase, WeChat, or network dependencies

### Requirement: Coverage Evidence
The change SHALL provide repeatable test commands and measured coverage evidence for both affected submodules.

#### Scenario: Test results are repeatable
- **WHEN** the implementation is complete
- **THEN** the Taro and Hono submodule test commands pass and coverage results are reported with the tested scope

### Requirement: Unit Test File Maintainability
The change SHALL keep unit test files maintainable by limiting each test file and shared test helper file to 500 lines or fewer.

#### Scenario: Large test suites are split by concern
- **WHEN** page-entry or API coverage requires many scenarios
- **THEN** tests are split into focused files or shared fixtures so no `*.test.js` file or `test/support/*.js` helper exceeds 500 lines
