## ADDED Requirements

### Requirement: Scene Workflow Coverage
The admin project SHALL cover scene workspace derivation, context-locked relation actions, and document editor behavior under the existing coverage gate.

#### Scenario: Scene derivation is covered
- **WHEN** admin unit tests run
- **THEN** tests verify that project and lesson scenes can be reconstructed from loaded resources without losing project, lesson, student, teacher, attendance, and relation status information

#### Scenario: Relation payload generation is covered
- **WHEN** admin unit tests run
- **THEN** tests verify that project-student, project-teacher, lesson-student, and lesson-teacher scene actions generate payloads with the locked parent identifier and selected child identifiers

#### Scenario: Context locking is covered
- **WHEN** admin component tests run
- **THEN** tests verify that known project and lesson context are displayed as locked context instead of editable generic relation selectors

#### Scenario: Document editor modes are covered
- **WHEN** admin component tests run
- **THEN** tests verify that the document editor modal can switch between edit, preview, split, Markdown, and HTML-oriented review modes while preserving draft content

#### Scenario: Verification reports scene commands
- **WHEN** implementation is complete
- **THEN** verification evidence includes the admin commands used for tests, coverage, lint, build, and OpenSpec validation
