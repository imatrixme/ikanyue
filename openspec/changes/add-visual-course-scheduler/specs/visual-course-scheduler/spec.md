## Purpose

Provide a role-aware visual scheduling surface where academic operators can create lessons from visible free time and teachers can understand their own week without receiving institution-wide or academic mutation authority.

## ADDED Requirements

### Requirement: Role-Aware Scheduler Defaults
The Admin calendar SHALL derive its initial scheduler context from the authenticated operator's capabilities.

#### Scenario: Academic operator enters schedule mode
- **WHEN** an academic operator enters schedule mode without an explicit view
- **THEN** the calendar opens an institution day scheduler grouped by eligible teachers

#### Scenario: Teacher-only operator enters the calendar
- **WHEN** an operator with teacher capability but without academic capability opens the calendar without an explicit view
- **THEN** the calendar opens a week view containing only lessons assigned to that authenticated teacher

#### Scenario: Explicit compatible view is preserved
- **WHEN** an operator opens a supported calendar URL with an explicit day or week view
- **THEN** the calendar preserves that view while retaining the operator's server-owned data scope

### Requirement: Visual Time-Slot Selection
The academic scheduler SHALL allow an operator to begin lesson creation directly from visible free time using thirty-minute boundaries.

#### Scenario: Operator clicks an empty slot
- **WHEN** an academic operator clicks an empty teacher time slot
- **THEN** the scheduler selects a sixty-minute interval beginning at that slot and opens the lesson creation drawer

#### Scenario: Operator drags across empty slots
- **WHEN** an academic operator drags across contiguous slots in one teacher row
- **THEN** the scheduler selects the covered interval on thirty-minute boundaries and opens the lesson creation drawer

#### Scenario: Operator opens an existing lesson
- **WHEN** an operator selects an occupied lesson block
- **THEN** the scheduler opens lesson details and does not start a new time selection

### Requirement: Context-Locked Lesson Creation
The academic scheduler SHALL create lessons through named business selections while preserving the teacher and time context selected on the scheduler.

#### Scenario: Drawer inherits scheduler context
- **WHEN** an academic operator opens the creation drawer from a teacher time slot
- **THEN** the teacher is fixed to that row, the selected start and end are prefilled, and duration is derived from the interval

#### Scenario: Operator selects a class
- **WHEN** the operator chooses an active class by name
- **THEN** the drawer derives its course, required credit type, default duration, and default location from the class and course configuration where available

#### Scenario: Operator saves a draft
- **WHEN** the operator submits valid lesson details with the draft action
- **THEN** the system creates one or more draft sessions and refreshes the calendar without publishing rosters or schedule claims

#### Scenario: Operator creates and publishes
- **WHEN** the operator submits a valid active class with the publish action
- **THEN** the system creates each draft, publishes it through the existing academic command, and assigns the selected scheduler teacher as the lead teacher override

### Requirement: Conflict and Repetition Feedback
The scheduler SHALL make overlapping visible work and repeated creation outcomes understandable before and after submission.

#### Scenario: Visible teacher or class overlap exists
- **WHEN** the selected interval overlaps a visible lesson for the chosen teacher or class
- **THEN** the drawer presents the conflicting lesson and prevents the publish action while still allowing a deliberate draft save

#### Scenario: Server rejects a publication conflict
- **WHEN** the final publication command detects a schedule claim conflict not present in the loaded calendar
- **THEN** the scheduler preserves the drawer, reports the conflict, and refreshes current calendar data

#### Scenario: Operator schedules repeated weeks
- **WHEN** the operator selects a supported weekly repeat count
- **THEN** the system creates the same local time in each requested week and reports the number of successfully created or published lessons if an occurrence fails

### Requirement: Responsive Scheduling Fallback
The calendar SHALL preserve readable scheduling context on narrow screens without compressing the institution resource matrix into unusable columns.

#### Scenario: Academic operator uses a narrow screen
- **WHEN** the institution scheduler is rendered below the desktop breakpoint
- **THEN** the calendar shows a day agenda and a clear add-lesson command that opens the same context-locked drawer

#### Scenario: Teacher operator uses a narrow screen
- **WHEN** a teacher-only operator opens the calendar below the desktop breakpoint
- **THEN** the calendar shows the personal week selector and daily agenda without institution-wide teacher controls

