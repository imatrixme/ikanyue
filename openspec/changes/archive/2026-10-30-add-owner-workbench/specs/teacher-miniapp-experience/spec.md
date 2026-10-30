## MODIFIED Requirements

### Requirement: Teacher Appointment Workbench
The teacher mini-program SHALL provide a scene-oriented workbench for pending decisions, today's teaching schedule, lessons waiting to be confirmed as taught, confirmed appointments, and conflict outcomes.

#### Scenario: Teacher reviews a pending request
- **WHEN** a teacher opens a request assigned to them
- **THEN** the page shows the student, human-readable course, requested time, location, response deadline, availability context, and confirm or decline actions without ledger identifiers

#### Scenario: Teacher confirms a request that just became unavailable
- **WHEN** confirmation loses a concurrent slot or eligibility race
- **THEN** the interface shows a stable conflict state, refreshes the queue, and does not display raw backend errors

#### Scenario: Teacher sees lessons waiting for confirmation
- **WHEN** a teacher opens the workbench after one of their lessons has started and is not yet settled
- **THEN** the lesson appears under lessons waiting for confirmation with its students and a "确认上课" action
