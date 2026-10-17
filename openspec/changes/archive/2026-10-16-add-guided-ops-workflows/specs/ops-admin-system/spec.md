## ADDED Requirements

### Requirement: Scenario Workflow Admin Surface
The standalone admin UI SHALL prioritize scenario workflow surfaces over raw resource tables for daily operations while retaining raw tables for advanced maintenance.

#### Scenario: Daily operations use scenario views
- **WHEN** an authorized operator navigates the admin shell
- **THEN** the primary operations entry includes a guided workflow workspace for scene-based actions before low-level resource maintenance

#### Scenario: Advanced resource maintenance remains available
- **WHEN** an administrator needs to inspect or correct raw operational records
- **THEN** existing resource tables remain reachable in an advanced maintenance grouping

### Requirement: Guided Creation UI Pattern
The standalone admin UI SHALL use reusable local React/Tailwind components for guided creation dialogs without adding parent repository dependencies.

#### Scenario: Guided dialog uses local components
- **WHEN** a guided creation flow is rendered
- **THEN** it uses local admin project components and dependencies declared only inside `ikanyue.admin`

#### Scenario: Browser does not access PocketBase directly
- **WHEN** a guided flow needs existing data or persistence
- **THEN** it uses `/ops/*` API clients and does not call PocketBase directly from browser code
