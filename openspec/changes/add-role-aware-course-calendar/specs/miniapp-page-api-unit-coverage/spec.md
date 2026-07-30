## ADDED Requirements

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
