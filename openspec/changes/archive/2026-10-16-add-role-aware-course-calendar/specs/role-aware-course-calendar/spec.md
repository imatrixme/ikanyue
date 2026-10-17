## ADDED Requirements

### Requirement: Formal Lesson Schedule Source
The system SHALL derive every formal institution, teacher, and learner calendar entry from `sessions` and its teacher, learner, and class relations.

#### Scenario: Confirmed appointment appears as a lesson
- **WHEN** a teacher confirms an appointment and the transaction creates a formal session
- **THEN** the institution, assigned teacher, and assigned learner schedule projections include the session

#### Scenario: Pending appointment is not a lesson
- **WHEN** an appointment remains pending and has not created a session
- **THEN** it remains in the appointment work queue and is excluded from formal lesson calendars

#### Scenario: Non-appointment lesson remains visible
- **WHEN** a class or Admin-created session is scheduled
- **THEN** it appears in every authorized calendar even without an appointment request

### Requirement: Institution Timetable API
The Ops API SHALL provide an institution timetable over a validated half-open date range with role-safe filters and lesson summaries.

#### Scenario: Academic operator loads a week
- **WHEN** an academic operator requests a valid seven-day range
- **THEN** the API returns all matching formal sessions with course, teacher, learner or class, time, location, status, source, and attention summaries

#### Scenario: Timetable filters are applied
- **WHEN** the operator filters by teacher, learner, class, course, status, or origin
- **THEN** the API returns only sessions matching every supplied filter and preserves the filter values in the response

#### Scenario: Excessive range is rejected
- **WHEN** a timetable request spans more than 42 days or contains invalid timestamps
- **THEN** the API rejects it with a stable validation code and performs no unbounded scan

#### Scenario: Unauthorized operator is rejected
- **WHEN** an operator without academic capability requests the institution timetable
- **THEN** the API rejects the request without returning lesson or participant data

### Requirement: Teacher Formal Calendar
The mini-program API SHALL return every formal session assigned to the authenticated teacher, independently of how the session was created.

#### Scenario: Teacher sees mixed lesson origins
- **WHEN** the teacher has class, appointment, and Admin-created sessions in the requested range
- **THEN** the calendar returns all three origins in start-time order

#### Scenario: Teacher cannot see another teacher's lesson
- **WHEN** a teacher requests a date range containing sessions assigned only to another teacher
- **THEN** those sessions are absent from the response

#### Scenario: Availability overlay is requested
- **WHEN** the teacher requests the schedule with availability enabled
- **THEN** the response includes effective recurring and override availability windows separately from formal lessons

#### Scenario: Legacy teacher calendar is called
- **WHEN** an existing client calls `/v1/teacher/calendar`
- **THEN** it receives the formal lesson projection through the compatibility adapter

### Requirement: Learner Upcoming Schedule
The system SHALL expose a learner-safe upcoming schedule and SHALL project the next three formal lessons on learner home surfaces.

#### Scenario: Learner has multiple upcoming lessons
- **WHEN** the learner has more than three future scheduled lessons
- **THEN** the home projection returns exactly the earliest three and the full lesson endpoint remains pageable

#### Scenario: Learner sees useful labels
- **WHEN** a learner lesson is returned
- **THEN** it includes course, public teacher name, class label when applicable, time, location, and user-facing status

#### Scenario: Learner has no future lesson
- **WHEN** the learner has no visible future formal session
- **THEN** the upcoming response is empty and the activity-home module remains hidden

#### Scenario: Internal entitlement fields are excluded
- **WHEN** a learner or teacher receives a schedule projection
- **THEN** the payload excludes internal course-credit ids, quantities, batch state, claims, and unrelated participant details

### Requirement: Role-Aware Mini-Program Home Schedule
The mini program SHALL show up to three upcoming lessons on the activity home and the role-specific course or workbench home without displacing activity content.

#### Scenario: Learner opens activity home
- **WHEN** an authenticated learner opens the activity tab with upcoming lessons
- **THEN** the page shows the next lesson prominently, up to two compact following lessons, and an action to the full schedule

#### Scenario: Teacher opens activity home
- **WHEN** an authenticated teacher opens the activity tab with assigned upcoming lessons
- **THEN** the page shows teacher-scoped lesson rows with learner or class context and an action to the teacher calendar

#### Scenario: Home schedule fails independently
- **WHEN** the upcoming schedule request fails while activities load successfully
- **THEN** the page keeps activity content usable and offers only a restrained schedule retry state

### Requirement: Calendar State and Time Consistency
All calendar APIs and clients SHALL use UTC storage, `Asia/Shanghai` presentation, half-open intervals, and consistent user-facing lesson states.

#### Scenario: Lesson is rescheduled
- **WHEN** an authorized command changes a lesson time using the current version
- **THEN** every calendar projection returns the new interval after refresh and identifies the adjusted state where applicable

#### Scenario: Lesson is cancelled
- **WHEN** a lesson is cancelled
- **THEN** it is removed from upcoming home results and remains available in full history with a cancelled status

#### Scenario: Lesson is in progress
- **WHEN** the current time falls within an in-progress lesson interval
- **THEN** the role home projection prioritizes it and labels it as currently in progress

#### Scenario: Concurrent update loses version claim
- **WHEN** a calendar action submits a stale lesson version
- **THEN** the command returns a stable conflict error and the client refreshes without overwriting the newer schedule

### Requirement: Calendar Query Performance
Calendar queries SHALL use bounded ranges, calendar-oriented indexes, and batched relation loading.

#### Scenario: Institution month is queried
- **WHEN** the Admin requests a valid month-grid range
- **THEN** the service loads session relations in bounded batches and does not issue one PocketBase request per lesson

#### Scenario: Calendar indexes are generated
- **WHEN** the schema migration is generated
- **THEN** it includes reversible lookup indexes for session time, teacher assignment, learner assignment, and class assignment
