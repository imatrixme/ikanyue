## ADDED Requirements

### Requirement: Refined Scene-First Admin Hierarchy
The standalone admin UI SHALL make scene workspaces and guided operations the primary path for ordinary teaching and operations work while keeping raw data resources secondary for maintenance.

#### Scenario: Operator sees scene paths before relation maintenance
- **WHEN** an authenticated teacher or administrator opens the admin shell
- **THEN** guided operations, project scene workspace, and lesson scene workspace are presented before raw project, lesson, and relation table maintenance in the teaching and operations hierarchy

#### Scenario: Relation tables explain their maintenance role
- **WHEN** an administrator opens a raw relation resource table
- **THEN** the UI labels the page as advanced maintenance and points normal creation or editing work to the relevant scene workspace

### Requirement: Non-Nested Form Editing Surfaces
The standalone admin UI SHALL avoid stacking document editor overlays inside create/edit overlays for generic resource or guided workflow forms.

#### Scenario: Form overlay delegates long-form editing
- **WHEN** a form overlay contains a long-form field
- **THEN** the field appears as a compact summary with an action that opens a single top-level document editor surface

#### Scenario: Editor close returns to the originating form
- **WHEN** the operator saves or closes the document editor
- **THEN** the originating form or guided workflow remains available with its prior short-field state preserved
