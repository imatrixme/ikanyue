## ADDED Requirements

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
