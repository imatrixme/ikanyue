## RENAMED Requirements

- FROM: `### Requirement: Matching Hono Endpoint Coverage`
- TO: `### Requirement: Matching API Endpoint Coverage`

## MODIFIED Requirements

### Requirement: Matching API Endpoint Coverage
The change SHALL add `kanyue.server` Go tests for backend routes used by the covered mini program page flows.

#### Scenario: Page API route is covered
- **WHEN** a registered mini program page calls a business API route through the request layer
- **THEN** the corresponding route behavior is covered by Go tests against an in-memory embedded PocketBase without live WeChat or network dependencies

### Requirement: Coverage Evidence
The change SHALL provide repeatable test commands and measured coverage evidence for both affected projects.

#### Scenario: Test results are repeatable
- **WHEN** the implementation is complete
- **THEN** the Taro test command and `GOMAXPROCS=1 TZ=Asia/Shanghai go test -p 1 -parallel 1 ./...` in `kanyue.server` pass and coverage results are reported with the tested scope

### Requirement: Coverage Gate Remains At Least Ninety Percent
Affected admin and mini program test suites SHALL maintain measured statement, branch, function, and line coverage at or above 90 percent where coverage tooling is configured; affected `kanyue.server` packages SHALL report Go statement coverage.

#### Scenario: Coverage commands pass
- **WHEN** the implementation is complete
- **THEN** affected admin and mini program coverage commands pass locally with thresholds set to at least 90 percent and the `kanyue.server` statement coverage is reported

### Requirement: Booking Page and Role Inventory
The change SHALL include every registered student and teacher booking page, role-aware TabBar path, shared appointment component, and matching `kanyue.server` endpoint in the mini-program coverage inventory.

#### Scenario: Booking inventory is checked
- **WHEN** the mini-program coverage and compiled-output contracts run
- **THEN** they include appointment creation, appointment list, appointment detail, teacher availability, role switching, teacher schedule, and the shared course pages modified for booking

### Requirement: Booking API Route Coverage
Every `kanyue.server` route used by student or teacher booking pages SHALL have success, validation, authorization, ownership, idempotency, and conflict tests without requiring production services.

#### Scenario: Mini-program booking API contract is covered
- **WHEN** the Go route tests run
- **THEN** student routes derive the student id from authentication, teacher routes enforce assigned teacher ownership, and neither response leaks internal ledger or claim fields

### Requirement: Calendar Page and Home Projection Coverage
The mini-program calendar change SHALL add deterministic unit and API tests for every new registered page, role-specific home projection, navigation path, refresh path, and pagination path.

#### Scenario: Teacher calendar logic is tested
- **WHEN** the teacher date strip, daily agenda, availability toggle, or full-schedule navigation transforms API data
- **THEN** Vitest covers the transformation and matching `kanyue.server` Go tests cover teacher ownership and formal-session projection

#### Scenario: Learner upcoming logic is tested
- **WHEN** activity home or course home selects the next three lessons or hides an empty module
- **THEN** Vitest covers ordering, limits, role switching, empty state, independent errors, and navigation

#### Scenario: Compiled mini-program boundary is verified
- **WHEN** the WeChat build completes
- **THEN** compiled output contains the calendar pages and role-safe schedule endpoints and contains no internal course-credit terminology in user-facing bundles

## REMOVED Requirements

### Requirement: Report Workflow Coverage
**Reason**: The mini program no longer registers report, share or operation-slot pages, and the report and share-token APIs had no caller; they were deleted with Hono.
**Migration**: None. Reintroduce reports as a new change with Go routes and their own tests.

### Requirement: Signup API Route Coverage
**Reason**: Activity signup had no caller and was deleted with Hono; the mini program only lists activities.
**Migration**: Activity listing is covered by `kanyue.server/internal/activities` tests.

### Requirement: Report API Coverage Includes Privacy And Authorization
**Reason**: The report APIs were deleted with Hono (see Report Workflow Coverage).
**Migration**: None.
