## Purpose

Define how course operations present people, teaching objects, lifecycle state, money, and credit activity in language that administrators and learners can recognize without understanding database identifiers or ledger implementation details.

## ADDED Requirements

### Requirement: Recognizable Business Identity
Admin course-operation surfaces SHALL present people and teaching objects through recognizable business identity before any stored identifier.

#### Scenario: Person appears in a selector
- **WHEN** an operator selects a student or teacher
- **THEN** the option shows the person's name first and a recognizable secondary detail such as cellphone, account state, or teaching role

#### Scenario: Person appears after selection
- **WHEN** a selected student or teacher appears in a roster, attendance row, confirmation, or result view
- **THEN** the same human-readable identity remains primary instead of reverting to a raw identifier

#### Scenario: Business object appears in a relationship control
- **WHEN** an operator selects a course, credit type, package, class, lesson, or price
- **THEN** the control shows its business name and decision-relevant context while preserving the stored identifier only as the submitted value

#### Scenario: Reference label is unavailable
- **WHEN** a related record cannot be resolved from currently loaded reference data
- **THEN** the UI shows an explicit unavailable-label fallback and may expose a shortened identifier as secondary diagnostic information without presenting it as a valid business name

### Requirement: Semantic Operational Language
Admin course-operation surfaces SHALL translate backend statuses, roles, channels, activation rules, credit actions, and other controlled values into consistent Chinese business language.

#### Scenario: Controlled value is known
- **WHEN** a known backend enum is rendered in a table, card, drawer, confirmation, or form
- **THEN** the UI shows its localized business label consistently across those surfaces

#### Scenario: Controlled value is unknown
- **WHEN** an unrecognized backend value is returned
- **THEN** the UI shows a safe unknown-state label and retains the raw value only in secondary technical detail

#### Scenario: Operator confirms a mutation
- **WHEN** an operator is about to publish, assign, remove, settle, reverse, or change status
- **THEN** the confirmation summarizes the affected people, business objects, current state, and resulting state in human-readable language

### Requirement: Diagnostic Detail Boundary
Raw identifiers, immutable event references, versions, JSON payloads, and ledger trace fields SHALL remain available only as secondary diagnostic detail in normal course-operation workflows.

#### Scenario: Operator scans a normal list
- **WHEN** an operator opens a course, package, enrollment, class, lesson, account, or workload list
- **THEN** the primary row content answers who or what is involved, what happened, and what action is needed without requiring raw identifiers

#### Scenario: Operator needs trace data
- **WHEN** an authorized operator opens technical details for troubleshooting or audit
- **THEN** the UI can show full identifiers, versions, event references, and raw trace fields in a visually separated diagnostic section

#### Scenario: Structured value reaches generic rendering
- **WHEN** a generic resource field contains an object or array
- **THEN** the normal view does not render serialized JSON and instead shows an intentional summary or an explicit technical-detail affordance

### Requirement: Learner Outcome Language
The mini program SHALL explain course-credit state through learner outcomes and next actions before exposing ledger terminology.

#### Scenario: Learner reviews balance
- **WHEN** a learner opens the course-credit summary
- **THEN** the page explains available lesson balance, balance reserved for upcoming lessons, used balance, and expiring balance in ordinary Chinese

#### Scenario: Learner reviews a reservation state
- **WHEN** a lesson has reserved, consumed, released, reversed, insufficient, or conversion-required credit state
- **THEN** the page describes whether the lesson is booked, paid from balance, returned, corrected, insufficient, or needs conversion and presents the next action when one exists

#### Scenario: Learner reviews balance history
- **WHEN** a learner opens course-credit history or source detail
- **THEN** each record explains the business source and balance outcome while batch IDs, operation IDs, rule versions, and reversal references remain secondary trace details

#### Scenario: Learner reviews a conversion
- **WHEN** a learner previews or confirms conversion
- **THEN** the page explains what balance will be exchanged, what balance will be received, the resulting expiry, activation timing, and whether the action can be undone without using authority or ledger jargon as the primary copy

### Requirement: Human-Readable Interaction States
Semantic selectors and human-readable projections SHALL preserve clear loading, empty, error, and unresolved-reference states.

#### Scenario: Reference choices are loading
- **WHEN** a relationship control opens before its reference data is ready
- **THEN** the control communicates that choices are loading and does not fall back to a free-text identifier input

#### Scenario: No valid choices exist
- **WHEN** no student, teacher, course, package, class, credit type, lesson, or price can be selected
- **THEN** the UI explains what prerequisite data is missing and prevents an invalid submission

#### Scenario: Reference request fails
- **WHEN** reference data cannot be loaded
- **THEN** the workflow retains its known context, shows a retryable error, and does not ask the operator to compensate by typing an identifier
