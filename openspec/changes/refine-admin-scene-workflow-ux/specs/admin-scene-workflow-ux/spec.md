## ADDED Requirements

### Requirement: Step-Based Scene Location
The admin UI SHALL locate project and lesson scenes through a step-based flow that starts from the operator's work motive rather than a native dropdown of records.

#### Scenario: Project workspace starts from motive
- **WHEN** an authorized operator opens the project scene workspace
- **THEN** the first decision asks what project-level task they are trying to complete before they lock a project

#### Scenario: Lesson workspace starts from motive
- **WHEN** an authorized operator opens the lesson scene workspace
- **THEN** the first decision asks what lesson-level task they are trying to complete before they lock a lesson

#### Scenario: Object selection scales beyond dropdowns
- **WHEN** multiple projects or lessons are available
- **THEN** the operator locates the target object through searchable, filterable rows with status and secondary context instead of a native select dropdown

#### Scenario: Context becomes locked after selection
- **WHEN** the operator chooses a project or lesson from the locator
- **THEN** later scene actions show that object as locked context and do not ask the operator to reselect the same parent record

### Requirement: Scene Object Picker
The admin UI SHALL provide reusable scene object picker components for selecting business objects in a way that exposes human-recognizable identity before raw data structure.

#### Scenario: Project and lesson rows show context
- **WHEN** the picker displays projects or lessons
- **THEN** each row shows a recognizable title, status, and secondary facts such as project type, planned count, related project, theme, time, or location when available

#### Scenario: People rows show identity
- **WHEN** the picker displays students or teachers
- **THEN** each row shows name, avatar or initials fallback, secondary contact or status information, and current relationship state when available

#### Scenario: Selected objects are separated
- **WHEN** the operator selects one or more objects
- **THEN** selected objects appear in a dedicated selected area and can be removed without losing the current workflow state

#### Scenario: Raw details stay secondary
- **WHEN** the operator needs raw identifiers or extra metadata
- **THEN** the UI exposes those details through hover, tooltip, or expanded detail surfaces rather than the primary row label

### Requirement: Single-Sheet Document Editing
The admin UI SHALL open meaningful long-form writing in one right-side document editor sheet controlled by the parent workspace instead of stacking editor overlays inside form overlays.

#### Scenario: Resource form opens one editor sheet
- **WHEN** an operator opens a resource create or edit form and then edits a long-form field
- **THEN** the document editor opens as the active right-side editor surface without rendering a second nested modal or sheet inside the form body

#### Scenario: Guided flow opens one editor sheet
- **WHEN** an operator edits a long-form field from a guided creation step
- **THEN** the document editor opens as the active right-side editor surface and returns the saved content to that guided field

#### Scenario: Editor exposes one active mode
- **WHEN** the document editor sheet is open
- **THEN** the operator can switch between edit, preview, split, Markdown, and HTML modes, with only the selected mode taking primary editing focus

#### Scenario: Draft protection remains clear
- **WHEN** the operator closes the editor with unsaved changes
- **THEN** the UI warns before discarding the editor draft and preserves the parent workflow state

### Requirement: Operator-Centered Workspace Hierarchy
The admin UI SHALL prioritize daily scenario workspaces and guided flows over raw relation tables in the authenticated workspace hierarchy.

#### Scenario: Daily teaching actions are primary
- **WHEN** an administrator or teacher opens the teaching section
- **THEN** project and lesson scene workspaces appear as normal daily operating surfaces before raw project, lesson, and relation maintenance tables

#### Scenario: Raw relation tables are advanced
- **WHEN** relation resources such as project students, project teachers, lesson students, or lesson teachers are shown
- **THEN** they are visually grouped as advanced maintenance and explain the scene workflow that should be used for normal creation

#### Scenario: Teacher path is task-oriented
- **WHEN** a non-admin teacher opens the admin workspace
- **THEN** the visible work surfaces emphasize assigned lessons, students, attendance, and reports rather than low-level maintenance resources outside their role
