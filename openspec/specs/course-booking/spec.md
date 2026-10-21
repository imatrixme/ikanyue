# course-booking Specification

## Purpose
TBD - created by archiving change add-self-service-course-booking. Update Purpose after archive.
## Requirements
### Requirement: Exact Course-Hour Booking Eligibility
The system SHALL allow a student to request an appointment only for an active course offering whose exact course hours can cover the requested lesson start time.

#### Scenario: Student has a valid remaining lesson
- **WHEN** an authenticated student requests booking options for a course with at least one exact available lesson valid at the proposed start time
- **THEN** the system returns eligible teachers and student-facing availability without exposing credit types, batches, freezing, or conversion data

#### Scenario: Student no longer has an eligible lesson
- **WHEN** a student submits or confirms an appointment after the matching lesson hours were consumed, reserved, cancelled, or expired
- **THEN** the system rejects or closes the request with a stable student-facing eligibility status and does not create a partial classroom record

### Requirement: Versioned Booking Policy and Teacher Availability
The system SHALL calculate bookable time in `Asia/Shanghai` from a versioned institution policy, teacher recurring availability, date overrides, lead-time rules, course duration, and active schedule claims.

#### Scenario: Default institution windows are used
- **WHEN** a booking-enabled teacher has no custom weekly availability
- **THEN** the system offers starts whose complete lesson duration fits within 09:00-11:00 or 14:00-19:00 and satisfies the configured start step

#### Scenario: Teacher closes a future period
- **WHEN** a teacher creates an unavailable override for a future period
- **THEN** new appointment options exclude that period while existing confirmed appointments remain unchanged

#### Scenario: Teacher attempts to open outside institution hours
- **WHEN** a teacher without Admin authority creates availability outside the active institution windows
- **THEN** the system rejects the override and preserves the previous availability version

### Requirement: Pending Requests Do Not Occupy Schedule Time
The system SHALL keep appointment requests non-blocking until the assigned teacher or an authorized Admin confirms them.

#### Scenario: Multiple students request the same open slot
- **WHEN** multiple eligible students submit pending requests for the same teacher and time before any request is confirmed
- **THEN** the system records the requests without creating schedule claims or freezing lesson hours

#### Scenario: Student repeats a pending request
- **WHEN** a student already has a pending request for the same course and submits another active request
- **THEN** the system rejects the duplicate without creating an additional request

### Requirement: Atomic Appointment Confirmation
Confirmation by the assigned teacher or an authorized Admin SHALL atomically create the formal lesson, reserve the student's exact lesson hours, assign the teacher and student, claim all occupied time cells, update the appointment, append audit facts, and enqueue notifications.

#### Scenario: Teacher confirms an available request
- **WHEN** the assigned teacher confirms a current pending request whose slot and lesson-hour eligibility remain valid
- **THEN** one PocketBase SDK Batch commits the session, roster, FEFO reservation, schedule claims, appointment event, state transition, and Outbox records

#### Scenario: Admin confirms for the assigned teacher
- **WHEN** an authorized Admin confirms a current pending request from the global booking queue
- **THEN** the same atomic confirmation uses the teacher stored on the appointment, records the Admin actor in audit facts, and does not accept a client-supplied teacher identity

#### Scenario: Concurrent confirmation targets overlapping time
- **WHEN** two confirmation commands attempt to claim any overlapping teacher or student time cell
- **THEN** the database unique constraint allows at most one command to commit and the losing command returns a slot conflict without partial writes

#### Scenario: Confirmation is retried
- **WHEN** the same confirmation command is retried with the same idempotency key and request fingerprint
- **THEN** the system returns the committed result without creating duplicate sessions, claims, allocations, or events

### Requirement: Unified Schedule Claims
All booking-created and Admin-created future lessons SHALL use the same active schedule-claim mechanism for every assigned teacher and enrolled student.

#### Scenario: Admin publishes a conflicting lesson
- **WHEN** an Admin lesson publication or reschedule overlaps an active teacher or student claim
- **THEN** the command is rejected atomically and the existing schedule remains unchanged

#### Scenario: Existing future lessons are migrated
- **WHEN** future scheduled lessons are backfilled into schedule claims
- **THEN** conflicts are reported for operator resolution and booking is not enabled for affected teachers until the conflicts are resolved

### Requirement: Appointment Cancellation and Rescheduling
The system SHALL keep appointment state, session state, lesson-hour allocations, and schedule claims consistent when an appointment is withdrawn, cancelled, or rescheduled.

#### Scenario: Student withdraws a pending request
- **WHEN** a student withdraws their own pending request
- **THEN** the request becomes withdrawn without changing lesson-hour balances or schedule claims

#### Scenario: Confirmed appointment is cancelled before cutoff
- **WHEN** an authorized actor cancels a confirmed appointment under the snapshotted cancellation policy
- **THEN** one transaction releases active claims and reserved lesson hours, cancels the linked session, appends events, and notifies both parties

#### Scenario: Reschedule target conflicts
- **WHEN** a teacher or Admin attempts to reschedule a confirmed appointment to an occupied time
- **THEN** the command fails and preserves the original appointment, claims, allocation, and session time

### Requirement: Appointment Audit, Expiry, and Notifications
The system SHALL append immutable appointment events and use Hono workers plus Outbox records for pending expiry and external notifications.

#### Scenario: Pending request reaches its response deadline
- **WHEN** the external scheduler invokes the appointment-expiry worker after a pending request deadline
- **THEN** Hono marks the request expired, appends an event, and enqueues a notification without using PocketBase hooks or cron

#### Scenario: Appointment state changes
- **WHEN** an appointment is requested, confirmed, declined, withdrawn, cancelled, rescheduled, or fulfilled
- **THEN** the system records actor, transition, timestamp, safe reason, aggregate identifiers, and trace information

### Requirement: Academy clock in the miniapp
The miniapp SHALL display and compose lesson, appointment, availability, points and activity times on the academy clock (Asia/Shanghai, UTC+08:00, the same clock the API books on), independent of the device timezone.

#### Scenario: Device in another timezone
- **WHEN** a device set to UTC shows an appointment starting at `2026-10-20T01:00:00Z`
- **THEN** it shows 10月20日 09:00

#### Scenario: Teacher picks a time
- **WHEN** a teacher on any device picks 2026-10-20 09:00 for an availability override or a reschedule
- **THEN** the submitted instant is `2026-10-20T01:00:00.000Z`

### Requirement: Retry-safe booking commands
The miniapp SHALL reuse the same idempotency key when retrying the same booking command for the same user and draft, and SHALL issue a new key only after the server has answered.

#### Scenario: Lost response
- **WHEN** a student's appointment request reaches the server but the response is lost, and the student taps submit again for the same slot
- **THEN** the retry carries the original key and receives the original result

#### Scenario: Different account on the same device
- **WHEN** another user signs in on the device
- **THEN** pending keys from the previous user are not reused

### Requirement: Lightweight withdrawal
A student SHALL withdraw a pending request through a confirmation dialog without typing a reason.

#### Scenario: Withdraw pending request
- **WHEN** a student taps "撤回申请" and confirms
- **THEN** the request is withdrawn without a reason and the detail page reloads

### Requirement: Explained disabled submit
Booking sheets that require a reason SHALL tell the user what is missing when the disabled submit button is tapped.

#### Scenario: Reason too short
- **WHEN** a user taps submit with fewer than 2 characters of reason
- **THEN** the miniapp shows "请填写至少 2 个字的原因"

### Requirement: Informed reschedule
The teacher reschedule sheet SHALL show the selected day's open availability windows for the appointment's course and the end time computed from the original duration.

#### Scenario: Choosing a new day
- **WHEN** a teacher picks a date in the reschedule sheet
- **THEN** the sheet lists that day's open windows for the course, or says there are none, and shows the new start and end times

### Requirement: Slot submit only with slots
The student slot page SHALL show the submit bar only when slots are listed.

#### Scenario: No slots
- **WHEN** the slot page is loading, failed or empty
- **THEN** no submit bar is shown

### Requirement: Clear credit cancellation
Credit-mode cancellation copy SHALL state that the reserved lesson returns to the course without a fee.

#### Scenario: Credit-mode cancel
- **WHEN** a student opens cancellation for a credit-mode appointment
- **THEN** the sheet says the reserved lesson returns to the course and no fee is charged

### Requirement: Unsaved availability guard
The teacher availability page SHALL warn before the page is left while weekly availability edits are unsaved.

#### Scenario: Leaving with edits
- **WHEN** a teacher edits weekly rules or switches mode and taps back without saving
- **THEN** the miniapp asks for confirmation before leaving

#### Scenario: After save
- **WHEN** the weekly rules are saved
- **THEN** leaving the page does not prompt

### Requirement: Consistent teacher naming
The teacher course tab SHALL use the title "工作台", matching its tab label. Upcoming-lesson links SHALL read "查看日历" for teachers and "全部日程" for students.

#### Scenario: Teacher opens course tab
- **WHEN** a teacher opens the second tab
- **THEN** the tab label and the navigation title both read "工作台"

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

