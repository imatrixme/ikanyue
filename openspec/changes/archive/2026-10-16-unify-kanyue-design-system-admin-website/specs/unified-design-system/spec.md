## ADDED Requirements

### Requirement: Versioned layered token source
The system SHALL maintain one versioned cross-platform token source with explicit foundation, semantic, component, and shared pattern layers.

#### Scenario: A shared visual decision is changed
- **WHEN** a maintainer changes a shared brand color, typography role, spacing role, control geometry, responsive breakpoint, or music-ticket pattern
- **THEN** the change is expressed in the appropriate token layer rather than duplicated as raw values in product components

#### Scenario: A page-specific value has no reusable meaning
- **WHEN** a value is used by only one page and does not represent a repeated component or pattern contract
- **THEN** it remains local layout geometry and is not promoted into the cross-platform token source

### Requirement: Deterministic platform token generation
The root generator SHALL validate the token source and deterministically emit committed platform-native outputs for the mini program, Admin, and Website.

#### Scenario: Generated outputs are current
- **WHEN** the token check command runs after generation
- **THEN** it succeeds without modifying files in any product

#### Scenario: A required token or generated output drifts
- **WHEN** a required key is missing or a committed platform output differs from the source-derived result
- **THEN** the token check command fails with the affected output or key identified

### Requirement: Independent product builds
Each product SHALL consume committed generated tokens without requiring a root package manager workspace or runtime dependency on another product.

#### Scenario: A subproject is cloned and built independently
- **WHEN** its committed generated token output is present
- **THEN** its documented install and build commands run using only that subproject's package metadata and lockfile

### Requirement: Platform-native component libraries
The mini program, Admin, and Website SHALL implement reusable components in their own frameworks while conforming to shared anatomy, variant, state, and accessibility contracts.

#### Scenario: A shared component concept is implemented on multiple platforms
- **WHEN** products implement controls such as buttons, page headers, form rows, async states, or ticket sections
- **THEN** each implementation uses native framework semantics and generated tokens while preserving the shared contract

### Requirement: Reusable mini program page patterns
The mini program SHALL provide reusable components for repeated page chrome, headers, form rows, segmented controls, section headings, sticky actions, media thumbnails, asynchronous states, and pagination or load-more states.

#### Scenario: A page fetches data
- **WHEN** loading, empty, error, refreshing, or pagination state changes
- **THEN** the page renders the shared state component while retaining ownership of the request and business decision

#### Scenario: A profile form renders editable fields
- **WHEN** account data is displayed or edited
- **THEN** repeated label/value/control geometry uses shared form-row and action components without changing save behavior

### Requirement: Raw brand value guard
Product source components SHALL use generated semantic or component tokens for brand color, typography, focus, and interaction states.

#### Scenario: A source component introduces a raw brand value
- **WHEN** design-system guard tests scan product source files
- **THEN** the check fails unless the value is an explicitly documented local media or content value

### Requirement: Existing mini program behavior is preserved
The design-system migration SHALL preserve mini program authentication, profile editing, activity loading, point history, reward availability, refresh, and pagination behavior.

#### Scenario: Shared components replace page-local markup
- **WHEN** the existing unit, build-facing E2E, and WeChat production build checks run
- **THEN** all existing business-flow assertions continue to pass

