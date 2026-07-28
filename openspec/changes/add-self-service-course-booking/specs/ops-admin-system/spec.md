## ADDED Requirements

### Requirement: Appointment Operations Workspace
The Admin system SHALL provide a dedicated `/appointments` workflow for pending decisions, confirmed bookings, calendar conflicts, booking rules, teacher offerings, cancellations, and rescheduling.

#### Scenario: Operator opens appointment management
- **WHEN** an authorized operator opens `/appointments`
- **THEN** the page provides a pending queue, date and teacher filters, human-readable status summaries, calendar context, and appointment detail drawers without exposing raw relation-table editing as the primary workflow

#### Scenario: Confirmed appointment opens its lesson
- **WHEN** an operator selects a confirmed appointment
- **THEN** the interface links to the existing lesson workflow for attendance, completion, settlement, and correction

### Requirement: Booking Capability and Ownership Authorization
The Ops API SHALL enforce Admin, academic capability, teacher ownership, and settlement boundaries for every booking operation.

#### Scenario: Teacher manages only their availability and requests
- **WHEN** a non-admin teacher accesses booking data through an authorized client
- **THEN** the system limits results and mutations to that teacher's offerings, availability, assigned requests, and linked lessons

#### Scenario: Academic operator manages global bookings
- **WHEN** an operator with academic capability configures offerings, resolves conflicts, cancels, or reschedules an appointment
- **THEN** the system permits the action after workflow-state, version, policy, ownership, and audit validation without granting finance or settlement capability

### Requirement: Booking Policy and Offering Management
Admin SHALL configure versioned institution booking policies and explicitly enable each teacher-course offering before students can see it.

#### Scenario: Offering is disabled
- **WHEN** a teacher-course offering is draft, inactive, or references an inactive course
- **THEN** it is absent from student booking options while historical appointments remain available to authorized users

#### Scenario: Policy revision is published
- **WHEN** an administrator publishes a new booking-policy version
- **THEN** new requests use the new version and existing requests retain their snapshotted terms

### Requirement: Booking Conflict and Migration Queue
Admin SHALL surface schedule-claim conflicts, failed backfills, lost eligibility, expired requests, and notification failures as actionable operational states.

#### Scenario: Existing lessons overlap during backfill
- **WHEN** the schedule-claim migration detects overlapping future lessons
- **THEN** the system records a conflict with teacher, student, lesson, time, and suggested resolution while leaving both source lessons unchanged
