## ADDED Requirements

### Requirement: Human-Readable Course Operations
The standalone admin UI SHALL apply semantic relationship controls and business-language projections to all normal course catalog, package, enrollment, class, lesson, account, teacher-workload, booking, and calendar workflows.

#### Scenario: Operator creates or edits course data
- **WHEN** an authorized operator edits a relationship field for a course, package, price, grant rule, conversion rule, class, or lesson
- **THEN** the form uses live human-readable choices and does not require manual entry of a record identifier

#### Scenario: Operator manages a class or lesson
- **WHEN** an authorized operator manages membership, teacher assignment, publishing, attendance, settlement, or correction
- **THEN** the workspace preserves names and business context through selection, review, confirmation, and result states

#### Scenario: Operator reads a course-operation record
- **WHEN** an authorized operator opens a list, card, drawer, or confirmation for a course-operation record
- **THEN** localized status and relationship labels are primary while raw identifiers and trace metadata are secondary

#### Scenario: Diagnostic workspace remains precise
- **WHEN** an authorized operator opens migration, reconciliation, audit, or technical trace detail
- **THEN** the UI may show raw identifiers and expected-versus-actual values while clearly separating them from normal operational actions
