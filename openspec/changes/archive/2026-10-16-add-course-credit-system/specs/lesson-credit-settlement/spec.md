## ADDED Requirements

### Requirement: Pre-Class Eligibility Check
The system SHALL evaluate each session student before the configured cutoff and SHALL surface insufficient or conversion-required status before lesson start.

#### Scenario: Matching credit is sufficient
- **WHEN** a student has an eligible batch for the exact required course type
- **THEN** the system reserves one credit and marks the student credit status as reserved

#### Scenario: Credit remains insufficient
- **WHEN** no matching credit or approved conversion can cover the lesson
- **THEN** the system marks the student as credit insufficient and notifies the student and operations staff

### Requirement: FEFO Batch Reservation
The system SHALL reserve eligible batches by earliest effective expiry first, then by configured priority and grant time.

#### Scenario: Two batches can cover a lesson
- **WHEN** both an earlier-expiring and later-expiring batch are valid for the lesson
- **THEN** the system freezes the earlier-expiring batch first

### Requirement: Idempotent Reservation
The system MUST reserve a given session-student requirement at most once.

#### Scenario: Reservation request is retried
- **WHEN** the same session-student reservation idempotency key is submitted again
- **THEN** the system returns the original allocation without increasing frozen quantity

### Requirement: Separate Attendance and Credit States
The system SHALL record attendance state independently from reservation and settlement state.

#### Scenario: Student checks in before settlement
- **WHEN** a student completes check-in but the teacher has not completed the lesson
- **THEN** attendance reflects checked-in while credit remains reserved

### Requirement: Rule-Based Completion Settlement
The system SHALL consume or release each reserved student credit according to the session's snapshotted attendance and cancellation rule after the lesson is completed.

#### Scenario: Student attends
- **WHEN** the session is completed and the student is present or late under the active rule
- **THEN** the system moves one reserved credit to consumed

#### Scenario: Timely leave is approved
- **WHEN** the student has approved leave before the rule cutoff
- **THEN** the system releases the reserved credit

#### Scenario: No-show rule consumes credit
- **WHEN** the student is absent and the session snapshot requires no-show consumption
- **THEN** the system consumes the reserved credit and records the rule version

### Requirement: Cancellation and Reschedule Handling
The system SHALL release institution-cancelled sessions and SHALL re-evaluate credit validity when a session is rescheduled.

#### Scenario: Released batch has already expired
- **WHEN** a cancelled session releases a credit after the source batch expiry
- **THEN** the released quantity becomes expired rather than available

#### Scenario: Rescheduled lesson exceeds batch expiry
- **WHEN** the new lesson start time is outside the reserved batch validity
- **THEN** the system releases that allocation and attempts a new eligible allocation

### Requirement: Atomic Session Settlement
Student credit movements, teacher pending earnings, session status, audit records, and outbox events MUST commit in one database transaction.

#### Scenario: Teacher earning creation fails
- **WHEN** student consumption succeeds in memory but teacher earning creation fails before commit
- **THEN** the entire settlement transaction rolls back and the session remains unsettled

### Requirement: Settlement Correction by Reversal
A settled session MUST NOT be edited in place; corrections SHALL reverse prior credit and teacher events before applying corrected facts and re-settling.

#### Scenario: Attendance is corrected after settlement
- **WHEN** an administrator changes a settled student from absent to present
- **THEN** the system creates a reversal operation, preserves the original events, and produces a new settlement result
