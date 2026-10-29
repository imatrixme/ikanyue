## MODIFIED Requirements

### Requirement: Page Entry Inventory
The change SHALL derive the mini program testing scope from pages registered in `ikanyue.mini/miniprogram/app.json`.

#### Scenario: Registered pages are inventoried
- **WHEN** the change identifies mini program page coverage targets
- **THEN** the inventory includes registered page paths and excludes unregistered page directories

### Requirement: Page Logic Unit Coverage
The change SHALL add deterministic unit tests for request orchestration or data-flow logic behind exposed mini program pages where that logic can run without WeChat DevTools.

#### Scenario: Page-facing logic is tested locally
- **WHEN** a registered page transforms request parameters, response data, navigation input, or local state
- **THEN** the behavior is covered by Vitest tests with a fake platform host or mocked request dependencies

### Requirement: Coverage Evidence
The change SHALL provide repeatable test commands and measured coverage evidence for both affected projects.

#### Scenario: Test results are repeatable
- **WHEN** the implementation is complete
- **THEN** the mini program test command (`ikanyue.mini`) and `GOMAXPROCS=1 TZ=Asia/Shanghai go test -p 1 -parallel 1 ./...` in `kanyue.server` pass and coverage results are reported with the tested scope

### Requirement: Booking Interaction Coverage
The change SHALL test role routing, slot selection, request submission, confirmation, withdrawal, cancellation, availability editing, pagination, refresh, and conflict recovery outside WeChat DevTools.

#### Scenario: Student booking flow is covered
- **WHEN** mini program unit tests run
- **THEN** they verify eligibility mapping, teacher and date selection, disabled slots, idempotent submission, pending state, withdrawal, cancellation cutoff, and safe error presentation

#### Scenario: Teacher booking flow is covered
- **WHEN** mini program unit tests run
- **THEN** they verify teacher workbench filtering, confirm and decline actions, concurrent slot conflict recovery, weekly availability validation, date overrides, and role-specific navigation
