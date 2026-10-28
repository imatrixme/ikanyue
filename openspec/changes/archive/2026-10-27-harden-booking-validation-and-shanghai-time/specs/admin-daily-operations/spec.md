## MODIFIED Requirements

### Requirement: Shanghai Time In The Admin
The Admin SHALL show and submit `datetime-local` values as Asia/Shanghai wall time, and SHALL derive calendar dates from the Shanghai day, whatever the browser's time zone. Displayed dates and times, date filters and "today" cutoffs SHALL also use Asia/Shanghai.

#### Scenario: Editing keeps the lesson time
- **WHEN** an operator opens a lesson that starts at 10:00 Shanghai time and saves it without changes
- **THEN** the lesson still starts at 10:00 Shanghai time

#### Scenario: Early-morning appointments group under their own day
- **WHEN** an appointment starts at 07:30 Shanghai time
- **THEN** the appointment calendar lists it under that Shanghai date

#### Scenario: Times display in Shanghai time from another zone
- **WHEN** an operator whose browser runs in Los Angeles views a record at 2026-10-18T23:30:00Z
- **THEN** lists and details show 2026-10-19 07:30

#### Scenario: Date filters cover the Shanghai day
- **WHEN** an operator filters the booking queue or the conflict list by a start and end date
- **THEN** the query covers 00:00:00 to 23:59:59 Asia/Shanghai on those dates

#### Scenario: Rescheduling keeps Shanghai wall time
- **WHEN** an operator opens the reschedule dialog for an appointment and submits it unchanged
- **THEN** the submitted start and end instants equal the original ones
