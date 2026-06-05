## ADDED Requirements

### Requirement: Project Scene Workspace
The admin UI SHALL provide a project scene workspace that helps operators manage one teaching project from motive-level actions instead of raw relation tables.

#### Scenario: Operator opens project workspace
- **WHEN** an authorized operator opens the project scene workspace
- **THEN** the UI shows the selected project's core context, roster, teacher roles, lesson timeline, and next actions without requiring the operator to inspect raw project relation collections

#### Scenario: Project context remains locked
- **WHEN** an operator starts an action from a selected project such as adding students or assigning teachers
- **THEN** the action shows the project as locked context and does not ask the operator to search for or reselect that project

#### Scenario: Project raw records remain traceable
- **WHEN** an administrator needs to inspect the underlying records for a project scene
- **THEN** the UI keeps links or labels that identify the generated project, project-student, project-teacher, lesson, lesson-student, and lesson-teacher records for maintenance use

### Requirement: Lesson Scene Workspace
The admin UI SHALL provide a lesson scene workspace that helps operators confirm a lesson, record attendance, confirm teachers, and continue post-class work from the lesson context.

#### Scenario: Operator opens lesson workspace
- **WHEN** an authorized operator opens the lesson scene workspace
- **THEN** the UI shows lesson context, inherited project information, planned time, place, participant roster, teacher assignment, attendance state, and post-class actions

#### Scenario: Lesson context remains locked
- **WHEN** an operator records attendance or confirms teachers from a selected lesson
- **THEN** the action shows the lesson as locked context and does not ask the operator to search for or reselect that lesson

#### Scenario: Teacher inheritance is explicit
- **WHEN** a lesson has project-level teachers and lesson-level teacher overrides
- **THEN** the UI distinguishes inherited teachers from lesson-specific teachers and explains which assignments will be used for that lesson

### Requirement: Context-Aware Relation Actions
Project and lesson relation changes SHALL be performed through scene actions that create or update the correct relation records while preserving the known parent context.

#### Scenario: Add project students from project scene
- **WHEN** an operator adds students from a project scene
- **THEN** the generated payload fixes `programId` to the current project and only asks the operator to choose students and relationship state

#### Scenario: Assign project teachers from project scene
- **WHEN** an operator assigns teachers from a project scene
- **THEN** the generated payload fixes `programId` to the current project and asks only for teachers, role, and active state

#### Scenario: Record lesson attendance from lesson scene
- **WHEN** an operator records attendance from a lesson scene
- **THEN** the generated payload fixes `sessionId` to the current lesson and asks only for students and attendance outcome

#### Scenario: Confirm lesson teachers from lesson scene
- **WHEN** an operator confirms lesson teachers from a lesson scene
- **THEN** the generated payload fixes `sessionId` to the current lesson and asks only for teachers, lesson role, and override state

### Requirement: Scene People Components
The admin UI SHALL represent students and teachers as recognizable people in scene actions rather than raw identifiers or generic table rows.

#### Scenario: People lists show identity cues
- **WHEN** a scene action presents candidate or selected people
- **THEN** each person row or card shows a name, avatar or initials fallback, recognizable secondary information, and current relationship status when available

#### Scenario: Selected people are promoted
- **WHEN** an operator selects people for a scene action
- **THEN** selected people appear in a dedicated selected area before the candidate list and remain removable without losing the locked parent context

#### Scenario: Secondary details stay secondary
- **WHEN** an operator needs more information about a person
- **THEN** hover, expand, or tooltip detail can show secondary data while raw IDs remain out of the primary path

### Requirement: Document Editor Modal
The admin UI SHALL edit meaningful long-form content in a large document editor modal instead of burying editors at the bottom of generic forms.

#### Scenario: Long-form field opens editor modal
- **WHEN** an operator edits a long-form description, note, report copy, or rich content field
- **THEN** the parent form shows a compact summary and opens a large editor modal for actual writing

#### Scenario: Editor supports review modes
- **WHEN** the document editor modal is open
- **THEN** the operator can switch between edit, preview, split preview, Markdown, and HTML-oriented modes without leaving the modal

#### Scenario: Editor preserves draft before submit
- **WHEN** an operator changes long-form content before submitting the parent form
- **THEN** the editor keeps the browser-side draft available to the parent form and warns before discarding unsaved changes

#### Scenario: Editor image intent is explicit
- **WHEN** an operator inserts or attaches images in the document editor
- **THEN** the UI presents an upload-oriented image action and preview state rather than asking the operator to manually type storage keys
