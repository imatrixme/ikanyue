# miniapp-page-api-unit-coverage Specification

## Purpose
TBD - created by archiving change add-page-entry-api-unit-coverage. Update Purpose after archive.
## Requirements
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

### Requirement: Report Workflow Coverage
The mini program report workflow SHALL have focused unit and API tests covering share-token viewing, student-owned report viewing, report history, and operation-slot navigation.

#### Scenario: Mini program report logic is tested
- **WHEN** mini program report page logic maps privacy-safe report payloads
- **THEN** unit tests cover summary, section details, comments, recommendations, empty states, invalid tokens, and student-owned report navigation

#### Scenario: Operation slot resilience is tested
- **WHEN** home page logic combines activities, operation slots, static navigation, and error states
- **THEN** unit tests cover activity failure, operation-slot failure, unsupported targets, and successful navigation target generation

#### Scenario: Hono student report APIs are tested
- **WHEN** student-facing report APIs are implemented
- **THEN** Hono tests cover listing own reports, opening own reports, rejecting other students' reports, rejecting anonymous access, and returning privacy-safe payloads

#### Scenario: Coverage evidence includes runtime-sensitive paths
- **WHEN** verification is complete
- **THEN** the final evidence includes Taro unit coverage, Taro WeChat build, Hono tests/coverage, and the repeatable mini program runtime verification command or documented simulator/manual script

### Requirement: Signup Page Logic Coverage
The mini program unit coverage SHALL include deterministic tests for activity signup and signup history page logic.

#### Scenario: Signup submission logic is covered
- **WHEN** the activity detail signup helper validates login state, required fields, duplicate responses, and API failures
- **THEN** Vitest tests cover the resulting request payloads and user-facing states without requiring WeChat DevTools

#### Scenario: Signup history mapping is covered
- **WHEN** signup history responses include empty lists, expanded activities, missing activities, and multiple statuses
- **THEN** Vitest tests cover the normalized view model and navigation URLs

### Requirement: Personal Content Entry Coverage
The mini program unit coverage SHALL include deterministic tests for profile personal-content entries.

#### Scenario: Profile personal content links are covered
- **WHEN** the profile page builds entries for reports, signups, audio favorites, and video favorites
- **THEN** tests verify the labels, login gating, and navigation targets

### Requirement: Signup API Route Coverage
The Hono unit coverage SHALL include backend routes used by the mini program signup flow.

#### Scenario: Signup route behavior is covered
- **WHEN** Node tests run for miniapp-facing activity signup APIs
- **THEN** they cover successful signup, anonymous rejection, missing fields, duplicate signup, full activity, ended activity, list, detail, cross-user detail rejection, and missing collection errors

### Requirement: Multi-Report Mini Program Coverage
The mini program page/API test scope SHALL include student report history and detail behavior for multiple reports that may share the same activity, program, session, or student.

#### Scenario: Report history renders multiple report kinds
- **WHEN** the report history page receives multiple published reports for the same student under one scope
- **THEN** unit tests cover display order, report type labels, title selection, status text, and navigation parameters for each report

#### Scenario: Report detail renders generic envelope
- **WHEN** the report detail page receives a generic report instance projection
- **THEN** unit tests cover summary, score, sections, recommendations, subject, recipient, scope, and empty optional fields without requiring legacy assessment-only fields

### Requirement: Report API Coverage Includes Privacy And Authorization
Hono route tests for report APIs SHALL cover generic report instance listing, detail access, and projection privacy in addition to legacy assessment snapshot access.

#### Scenario: Student sees only own published reports
- **WHEN** Hono tests request the student report list with seeded published, draft, and other-recipient report instances
- **THEN** only published reports addressed to the authenticated student are returned

#### Scenario: Report response hides private fields
- **WHEN** Hono tests request a student-owned report detail or public assessment share payload
- **THEN** assertions verify that private PocketBase fields are absent from nested student, teacher, subject, and recipient objects

### Requirement: Coverage Gate Remains At Least Ninety Percent
Affected Hono, admin, and mini program test suites SHALL maintain measured statement, branch, function, and line coverage at or above 90 percent where coverage tooling is configured.

#### Scenario: Coverage commands pass
- **WHEN** the implementation is complete
- **THEN** affected subproject coverage commands pass locally with thresholds set to at least 90 percent

### Requirement: Course Tab Page Coverage
The change SHALL cover the registered course tab, course detail, course schedule, lesson detail, and lesson-hour record page logic with deterministic Vitest tests.

#### Scenario: Course overview transforms projection data
- **WHEN** the learning overview contains multiple courses, a next lesson, warnings, and recent records
- **THEN** unit tests verify ordering, labels, navigation parameters, loading, empty, error, and refresh states

### Requirement: Student Vocabulary Guard
The change SHALL include repeatable source and compiled-output checks preventing student course surfaces from displaying internal ledger terminology.

#### Scenario: Course mini program is built
- **WHEN** the compiled course pages are inspected
- **THEN** their visible copy does not contain course-credit, batch, frozen, conversion-rule, reversal, operation-number, or raw settlement terminology

### Requirement: Read-Only Course API Coverage
The change SHALL test every `/v1/student/learning/*` route used by the mini program and prove that no student mutation route is required for course pages.

#### Scenario: Mini program API inventory is checked
- **WHEN** course page request bindings are inspected
- **THEN** only learning overview, course detail, lesson list/detail, and lesson-record queries are present

### Requirement: Booking Page and Role Inventory
The change SHALL include every registered student and teacher booking page, role-aware TabBar path, shared appointment component, and matching Hono endpoint in the mini-program coverage inventory.

#### Scenario: Booking inventory is checked
- **WHEN** the mini-program coverage and compiled-output contracts run
- **THEN** they include appointment creation, appointment list, appointment detail, teacher availability, role switching, teacher schedule, and the shared course pages modified for booking

### Requirement: Booking Interaction Coverage
The change SHALL test role routing, slot selection, request submission, confirmation, withdrawal, cancellation, availability editing, pagination, refresh, and conflict recovery outside WeChat DevTools.

#### Scenario: Student booking flow is covered
- **WHEN** Taro unit tests run
- **THEN** they verify eligibility mapping, teacher and date selection, disabled slots, idempotent submission, pending state, withdrawal, cancellation cutoff, and safe error presentation

#### Scenario: Teacher booking flow is covered
- **WHEN** Taro unit tests run
- **THEN** they verify teacher workbench filtering, confirm and decline actions, concurrent slot conflict recovery, weekly availability validation, date overrides, and role-specific navigation

### Requirement: Booking API Route Coverage
Every Hono route used by student or teacher booking pages SHALL have success, validation, authorization, ownership, idempotency, and conflict tests without requiring production services.

#### Scenario: Mini-program booking API contract is covered
- **WHEN** Hono route tests run
- **THEN** student routes derive the student id from authentication, teacher routes enforce assigned teacher ownership, and neither response leaks internal ledger or claim fields

### Requirement: Calendar Page and Home Projection Coverage
The mini-program calendar change SHALL add deterministic unit and API tests for every new registered page, role-specific home projection, navigation path, refresh path, and pagination path.

#### Scenario: Teacher calendar logic is tested
- **WHEN** the teacher date strip, daily agenda, availability toggle, or full-schedule navigation transforms API data
- **THEN** Vitest covers the transformation and matching Hono tests cover teacher ownership and formal-session projection

#### Scenario: Learner upcoming logic is tested
- **WHEN** activity home or course home selects the next three lessons or hides an empty module
- **THEN** Vitest covers ordering, limits, role switching, empty state, independent errors, and navigation

#### Scenario: Compiled mini-program boundary is verified
- **WHEN** the WeChat build completes
- **THEN** compiled output contains the calendar pages and role-safe schedule endpoints and contains no internal course-credit terminology in user-facing bundles

### Requirement: Calendar Test File Maintainability
Calendar unit tests and helpers SHALL remain at or below 500 lines per file.

#### Scenario: Calendar coverage grows
- **WHEN** calendar scenarios exceed one focused concern
- **THEN** tests are split by query, projection, view, or interaction concern instead of growing a monolithic test file

