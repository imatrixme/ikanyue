## MODIFIED Requirements

### Requirement: Modal-Based Scene Location
The admin UI SHALL support searchable project and lesson scene location through a modal wizard, but SHALL NOT force that wizard before showing daily work when a usable project or lesson already exists.

#### Scenario: Project workspace opens directly when data exists
- **WHEN** an authorized operator opens the project scene workspace and at least one project exists
- **THEN** the page shows a locked project workspace with summary, rosters, timeline, and action buttons without first opening the setup modal

#### Scenario: Lesson workspace opens directly when data exists
- **WHEN** an authorized operator opens the lesson scene workspace and at least one lesson exists
- **THEN** the page shows a locked lesson workspace with summary, attendance, teacher inheritance, and action buttons without first opening the setup modal

#### Scenario: Setup modal remains explicit context recovery
- **WHEN** the operator chooses to change the current project or lesson
- **THEN** the UI opens the setup modal with vertical steps on the left and active fields on the right

#### Scenario: Object selection scales beyond dropdowns
- **WHEN** multiple projects or lessons are available in the setup modal
- **THEN** the operator locates the target object through searchable rows with status and secondary context instead of a native select dropdown

#### Scenario: Context becomes locked after confirmation
- **WHEN** the operator confirms a project or lesson from the locator
- **THEN** later scene actions show that object as locked context and do not ask the operator to reselect the same parent record

#### Scenario: Empty scene state does not expose relation actions
- **WHEN** no project or lesson exists for the workspace
- **THEN** the page shows an empty state and does not show relation action buttons that would create orphaned relationships

#### Scenario: Operator can recover from wrong context
- **WHEN** the operator reaches a locked workspace and notices the wrong project or lesson
- **THEN** the UI provides a clear change-context action that reopens the setup modal without performing relation changes

### Requirement: Focused Scene Relation Actions
The admin UI SHALL handle simple relation actions from locked project and lesson contexts in a focused right-side action sheet rather than a multi-step wizard.

#### Scenario: Scene action sheet keeps context visible
- **WHEN** the operator starts follow-up work from a locked project or lesson workspace, such as adding students, assigning teachers, or recording attendance
- **THEN** the action opens as a right-side sheet that shows the locked context without requiring a separate context-confirmation step

#### Scenario: People selection is searchable and human-readable
- **WHEN** the scene action sheet is open
- **THEN** the operator can search people rows that show name, avatar or initials fallback, secondary contact or status information, and current relationship state when available

#### Scenario: Selected people are separated
- **WHEN** the operator selects one or more people in the scene action sheet
- **THEN** selected people appear in a dedicated selected area and can be removed without losing the current action state

#### Scenario: Action detail and save summary are visible together
- **WHEN** the operator selects relationship state, role, or attendance status
- **THEN** the sheet keeps the action detail and a human-readable save summary visible without navigating to a separate final review step

#### Scenario: Locked relation payloads are preserved
- **WHEN** the operator saves a scene action
- **THEN** the generated relation payloads include the locked project or lesson identifier and the selected people identifiers

### Requirement: Scene Object Picker
The admin UI SHALL provide reusable scene object picker components for selecting business objects in a way that exposes human-recognizable identity before raw data structure.

#### Scenario: Project and lesson rows show context
- **WHEN** the picker displays projects or lessons
- **THEN** each row shows a recognizable title, status, and secondary facts such as project type, planned count, related project, theme, time, or location when available

#### Scenario: Raw details stay secondary
- **WHEN** the operator needs raw identifiers or extra metadata
- **THEN** the UI exposes those details through hover, tooltip, or expanded detail surfaces rather than the primary row label

### Requirement: Operator-Centered Workspace Hierarchy
The admin UI SHALL prioritize role-specific daily scenario workspaces and guided flows over raw relation tables in the authenticated workspace hierarchy.

#### Scenario: Teacher path is task-oriented
- **WHEN** a non-admin teacher opens the workspace
- **THEN** the visible work surfaces emphasize lessons, students, attendance, assessment writing, and reports rather than low-level maintenance resources outside their role

#### Scenario: Administrator dashboard is an operations cockpit
- **WHEN** an administrator opens the workspace dashboard
- **THEN** the dashboard surfaces signup conversion, lesson scheduling, guided operations, relation gaps, and data maintenance entry points

#### Scenario: Raw relation tables are advanced
- **WHEN** relation resources such as project students, project teachers, lesson students, or lesson teachers are shown
- **THEN** they are visually grouped as advanced maintenance and explain the scene workflow that should be used for normal creation

### Requirement: Data Maintenance Table Experience
The admin UI SHALL use TanStack-backed table behavior for generic data maintenance surfaces.

#### Scenario: Data tables support maintenance interactions
- **WHEN** a generic resource table is shown
- **THEN** the table supports sorting, page-local filtering, row selection, selected counts, and density switching

#### Scenario: Data tables are not the primary teaching path
- **WHEN** a generic resource table is shown
- **THEN** the UI labels it as data maintenance and points daily teaching actions toward scene workspaces where appropriate
