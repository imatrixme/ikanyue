## MODIFIED Requirements

### Requirement: Operator Booking On Behalf Of A Student
Operators with the academic capability SHALL be able to request a one-to-one appointment for a student. The request SHALL go through the same eligibility, slot, balance, duplicate and policy checks as a student request. If the operator asks to confirm, the same command SHALL also confirm the appointment, with an idempotency key derived from the request key. A one-step booking SHALL either end confirmed or leave no pending request behind.

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

#### Scenario: Confirmation fails after the request was created
- **WHEN** the request is created with `confirm: true` but confirmation throws
- **THEN** the request is withdrawn on the student's behalf with the reason "代约确认失败，已自动撤回"
- **AND** the original error is returned, so the next attempt for the same course is not blocked

#### Scenario: Confirmation closes the request
- **WHEN** confirmation closes the request as expired or eligibility-lost instead of confirming it
- **THEN** the command fails with `APPOINTMENT_CONFIRM_CLOSED` instead of reporting success

#### Scenario: Operator sees the student's options
- **WHEN** an academic operator opens "代约一对一" for a student
- **THEN** the Admin lists that student's bookable courses and teachers from `GET /ops/course-bookings/students/:studentId/options`
- **AND** it lists open slots for the chosen offering from `GET /ops/course-bookings/students/:studentId/slots`, with a `from`/`to` window of the next 30 days

#### Scenario: Unknown student is rejected
- **WHEN** the student id does not exist
- **THEN** the options, slots and create endpoints reject the request without side effects

## ADDED Requirements

### Requirement: Booking Time Filters Compare Instants
Booking and schedule queries SHALL compare time ranges as instants, whatever ISO format the caller sends. Instants SHALL be normalized to the stored PocketBase date format before they are placed in a filter.

#### Scenario: A claimed slot is rejected when the request is created
- **WHEN** a request names a slot that overlaps an active claim on the same UTC day, and its times are sent as ISO `...T...Z` strings
- **THEN** the slot check finds the claim and rejects the request with `BOOKING_SLOT_UNAVAILABLE`

#### Scenario: Appointment date filters keep boundary rows
- **WHEN** an operator filters appointments from a day start that falls on the same UTC day as an appointment's end
- **THEN** the appointment is included exactly when it ends after the filter start
