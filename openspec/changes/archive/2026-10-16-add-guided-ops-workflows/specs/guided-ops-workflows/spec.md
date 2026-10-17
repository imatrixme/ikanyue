## ADDED Requirements

### Requirement: Scenario-First Operations Entry
The admin system SHALL provide scenario-first operations entry points that start from human intent rather than raw data collections.

#### Scenario: Operator opens scenario workspace
- **WHEN** an authorized operations user opens the guided operations workspace
- **THEN** the system presents common creation intents such as publishing signup activities, arranging trial lessons, opening classes, adding lessons, processing signups, recording attendance, and launching reports

#### Scenario: Scenario chooses defaults
- **WHEN** an operator starts a creation flow from a specific scenario
- **THEN** the system preselects relevant defaults such as flow type, resource types, scope types, statuses, and generated-record kinds without asking the operator to choose low-level database parameters

### Requirement: Guided Creation Dialog
The admin system SHALL provide guided creation dialogs with a vertical stepper on the left and a focused form for the active step on the right.

#### Scenario: Step form stays focused
- **WHEN** an operator is completing a guided creation flow
- **THEN** each step asks only the small set of fields or choices needed for that decision before moving to the next step

#### Scenario: Step navigation preserves answers
- **WHEN** an operator moves between steps in the guided dialog
- **THEN** the system preserves previously entered answers and updates the generated-result preview from the current answers

### Requirement: Time Place People Confirmation
Every guided creation flow SHALL explicitly collect or mark as pending the time, place, and people involved in the scenario.

#### Scenario: Required operational facts are visible
- **WHEN** an operator reaches the confirmation step of any guided creation flow
- **THEN** the summary explicitly shows time, place, and responsible or participating people as provided values or pending values

#### Scenario: Unknown facts are deliberate
- **WHEN** time, place, teacher, student, or responsible staff are not yet known
- **THEN** the operator can mark the fact as pending and the generated plan records that pending state rather than silently omitting it

### Requirement: Generated Operation Plan
Guided creation flows SHALL produce a generated operation plan that describes the business objects and relations that will be created or updated.

#### Scenario: Activity signup plan is generated
- **WHEN** an operator configures a freely sign-up activity
- **THEN** the generated plan includes the activity, signup handling, optional operation slot, class assignment rule, sessions if applicable, and report follow-up if selected

#### Scenario: Class lesson plan is generated
- **WHEN** an operator configures a one-on-one or group teaching scenario
- **THEN** the generated plan includes class or learning-unit creation, learning program, lesson sessions, teacher assignments, student assignments, attendance expectations, and optional report tasks

### Requirement: Scene-Based Redundant Views
The admin system SHALL present operational data through business scene views in addition to advanced raw data tables.

#### Scenario: Same data appears in relevant scenes
- **WHEN** activity, signup, class, lesson, attendance, and report data exist
- **THEN** the system can show the same underlying records from activity, signup, class, lesson, student, teacher, and report perspectives without duplicating source-of-truth data

#### Scenario: Raw tables remain available
- **WHEN** an administrator needs low-level correction, audit, or troubleshooting
- **THEN** the system keeps raw resource tables available under an advanced maintenance area

### Requirement: Guided Workflow Testability
Guided workflow definitions, default derivation, generated plans, and dialog interaction behavior SHALL be covered by focused admin tests.

#### Scenario: Workflow definitions are covered
- **WHEN** admin unit tests run
- **THEN** tests verify that every guided flow includes purpose, participants, time, place, people, rules, and confirmation steps

#### Scenario: Generated plans are covered
- **WHEN** admin unit tests run
- **THEN** tests verify generated plans for signup activity, trial lesson, class lesson, attendance, and report launch scenarios
