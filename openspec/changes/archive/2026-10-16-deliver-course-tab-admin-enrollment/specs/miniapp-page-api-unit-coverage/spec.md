## ADDED Requirements

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

