## ADDED Requirements

### Requirement: Institution Course Calendar Workspace
The Admin system SHALL expose a first-class institution timetable workspace that uses Hono schedule APIs and existing lesson command services.

#### Scenario: Timetable is directly navigable
- **WHEN** an authorized academic operator selects the institution timetable navigation item
- **THEN** the Admin opens a URL-stable calendar workspace rather than an in-page booking subview

#### Scenario: Operator changes calendar view
- **WHEN** the operator switches among day, week, month, and list modes or changes the visible date
- **THEN** the URL preserves the view and date and the workspace requests the corresponding bounded range

#### Scenario: Operator filters the timetable
- **WHEN** the operator selects teacher, learner, class, course, status, or origin filters
- **THEN** the filters remain URL-stable and update the visible institution schedule

#### Scenario: Operator opens lesson detail
- **WHEN** the operator selects a lesson event
- **THEN** the Admin opens a detail drawer with course, participants, time, location, state, source, and existing authorized actions

#### Scenario: Narrow viewport uses readable fallback
- **WHEN** the calendar workspace is rendered on a narrow Admin viewport
- **THEN** it uses a date agenda or list presentation without overlapping controls or unreadable event labels

### Requirement: Calendar Mutation Safety
The Admin calendar SHALL delegate cancellation and rescheduling to existing versioned Hono commands and SHALL NOT mutate PocketBase directly.

#### Scenario: Reschedule succeeds
- **WHEN** an operator submits a valid new interval from the lesson drawer
- **THEN** the existing reschedule command applies conflict checks and the calendar refreshes the affected range

#### Scenario: Reschedule conflicts
- **WHEN** the new interval conflicts or uses a stale version
- **THEN** the Admin shows a stable error, retains the current server schedule, and refreshes the lesson detail
