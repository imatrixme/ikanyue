## ADDED Requirements

### Requirement: Operator Booking On Behalf Of A Student
Operators with the academic capability SHALL be able to request a one-to-one appointment for a student. The request SHALL go through the same eligibility, slot, balance, duplicate and policy checks as a student request. If the operator asks to confirm, the same command SHALL also confirm the appointment, with an idempotency key derived from the request key.

#### Scenario: Operator books and confirms in one command
- **WHEN** an academic operator submits `POST /ops/course-bookings/appointments` with a student, an offering, an open slot and `confirm: true`
- **THEN** the appointment is created for that student and then confirmed
- **AND** a retry with the same `Idempotency-Key` replays both steps without creating another appointment

#### Scenario: Operator booking leaves the request pending
- **WHEN** the operator submits the same request with `confirm: false`
- **THEN** the appointment stays pending in the confirmation queue

#### Scenario: Student rules still apply
- **WHEN** the student lacks the required course hours or the slot is no longer open
- **THEN** the command fails with the same error a student request would get, and nothing is created

#### Scenario: Operator sees the student's options
- **WHEN** an academic operator opens "代约一对一" for a student
- **THEN** the Admin lists that student's bookable courses and teachers from `GET /ops/course-bookings/students/:studentId/options`
- **AND** it lists open slots for the chosen offering from `GET /ops/course-bookings/students/:studentId/slots`

#### Scenario: Unknown student is rejected
- **WHEN** the student id does not exist
- **THEN** the options, slots and create endpoints reject the request without side effects
