## ADDED Requirements

### Requirement: Lifecycle-Based Admin Hierarchy
The admin UI SHALL organize the authenticated workspace around the teaching operations lifecycle instead of exposing raw data collections as the primary navigation model.

#### Scenario: Administrator sees lifecycle groups
- **WHEN** an administrator opens the authenticated admin shell
- **THEN** the primary navigation shows lifecycle groups for workspace, signup conversion, classes and packages, scheduling and lessons, assessment and reports, student records, content and miniapp publishing, data center, and system settings

#### Scenario: Raw relation tables are not ordinary top-level work
- **WHEN** an administrator scans the ordinary lifecycle groups
- **THEN** relation resources for class students, class teachers, lesson students, and lesson teachers are not presented as ordinary workflow destinations

#### Scenario: Teacher sees task-oriented groups
- **WHEN** a non-admin teacher opens the authenticated admin shell
- **THEN** the visible navigation emphasizes the teacher workspace, lessons, students, assessment writing, and reports without showing administrator data-center maintenance destinations

### Requirement: Role Work Queues
The admin dashboard SHALL present role-scoped pending work and lifecycle state before generic metrics or raw module shortcuts.

#### Scenario: Administrator dashboard starts with operational queues
- **WHEN** an administrator opens the dashboard
- **THEN** the dashboard surfaces concrete queues for pending signups, conversion work, scheduling gaps, upcoming lessons, report work, and miniapp publishing readiness when data is available

#### Scenario: Teacher dashboard starts with teaching work
- **WHEN** a teacher opens the dashboard
- **THEN** the dashboard surfaces today's lessons, related students, attendance or feedback work, and report work scoped to that teacher

#### Scenario: Empty queues explain the next action
- **WHEN** a dashboard queue has no records
- **THEN** the queue shows an empty state that explains the next human action rather than exposing raw collection names

### Requirement: Motive-Based Guided Operations
The guided operations workspace SHALL expose a small set of primary human motives before exposing detailed workflow templates.

#### Scenario: Guided operations are grouped by motive
- **WHEN** an administrator opens guided operations
- **THEN** the first-level choices are grouped around publishing a signup activity, processing signup conversion, creating a class or learning unit, scheduling a lesson, recording lesson results, and launching assessment or report work

#### Scenario: Detailed workflows are secondary
- **WHEN** a motive contains multiple detailed workflows
- **THEN** the detailed workflows appear as secondary choices inside that motive rather than as equal-weight cards on the main workbench

#### Scenario: Content publishing is separated from teaching operations
- **WHEN** an operator is working in the teaching operations area
- **THEN** audio, video, material, and miniapp placement flows are not mixed into the main teaching workflow choices

### Requirement: Business-Facing Labels
The admin UI SHALL translate internal resource names into business-facing language in ordinary navigation, dashboards, scene workspaces, and guided flows.

#### Scenario: Teaching objects use human terms
- **WHEN** the UI displays learning program and learning session resources in ordinary work areas
- **THEN** it labels them as classes, learning units, lessons, classrooms, or sessions using the closest business meaning instead of exposing collection-style labels

#### Scenario: Report objects use task and result terms
- **WHEN** the UI displays report event and report instance resources in ordinary work areas
- **THEN** it labels them as report tasks and generated reports rather than report events and report instances

#### Scenario: Diagnostics can expose technical details secondarily
- **WHEN** an administrator enters the data center or opens advanced details
- **THEN** the UI may expose internal resource names, raw identifiers, or diagnostic metadata as secondary information

### Requirement: Advanced Data Center Boundary
The admin UI SHALL preserve raw data maintenance as an advanced administrator surface that is visually and semantically separated from normal lifecycle work.

#### Scenario: Data center explains its purpose
- **WHEN** an administrator opens the data center
- **THEN** the page explains that it is for inspection, repair, and advanced maintenance rather than ordinary teaching operations

#### Scenario: Data center retains maintenance capabilities
- **WHEN** an administrator opens a data-center resource table
- **THEN** sorting, filtering, row selection, density controls, and edit actions remain available for maintenance

#### Scenario: Normal pages point away from raw repair paths
- **WHEN** an ordinary lifecycle page needs to reference a low-level relationship or generated object
- **THEN** it describes the human action or resulting relationship and links to data-center maintenance only as a secondary advanced path
