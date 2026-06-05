## ADDED Requirements

### Requirement: Scene-First Teaching Operations
The standalone admin UI SHALL prioritize project and lesson scene workspaces for daily teaching operations while retaining raw resource tables for advanced maintenance.

#### Scenario: Teaching operators see scene entries first
- **WHEN** an authorized operator navigates teaching operations
- **THEN** project and lesson scene entries appear as primary operating surfaces before raw project, lesson, and relation maintenance tables

#### Scenario: Relation maintenance is secondary
- **WHEN** an administrator opens raw resources such as project students, project teachers, lesson students, or lesson teachers
- **THEN** the UI indicates that normal creation is better performed from the relevant project or lesson scene while still allowing advanced inspection and correction

#### Scenario: Scene vocabulary hides database names
- **WHEN** an operator performs a daily operation from a scene workspace
- **THEN** labels use business verbs such as add students, assign teachers, record attendance, and confirm lesson teachers instead of requiring operators to understand collection names

### Requirement: Context-Locked Scene Forms
The standalone admin UI SHALL prevent operators from reselecting parent objects that are already known from the current scene.

#### Scenario: Known project is not reselected
- **WHEN** an operator starts a student or teacher assignment from a selected project
- **THEN** the form locks and displays the current project while omitting a searchable project picker from the active decision fields

#### Scenario: Known lesson is not reselected
- **WHEN** an operator starts attendance or lesson-teacher confirmation from a selected lesson
- **THEN** the form locks and displays the current lesson while omitting a searchable lesson picker from the active decision fields

#### Scenario: Context can be changed only deliberately
- **WHEN** changing the locked project or lesson is valid
- **THEN** the UI exposes a deliberate change-context action separate from the normal submit flow

### Requirement: Dedicated Long-Form Editing Experience
The standalone admin UI SHALL use a dedicated editor modal for rich or long-form fields that require meaningful writing and review.

#### Scenario: Generic forms summarize long content
- **WHEN** a generic resource form includes a long-form or rich-text field
- **THEN** the form shows a summary and an edit action instead of placing a full editor at the bottom of the form layout

#### Scenario: Editor modal supports authoring and preview
- **WHEN** an operator opens the dedicated editor modal
- **THEN** the modal provides enough writing space and supports edit, preview, split preview, Markdown, and HTML review modes

#### Scenario: Long-form edits submit with the parent record
- **WHEN** an operator saves content in the editor modal and submits the parent form
- **THEN** the submitted payload includes the latest editor content without requiring a separate manual copy step
