## ADDED Requirements

### Requirement: Owner Sees the Studio at a Glance
An administrator teacher SHALL be able to view, for today, this week or this month in Beijing time, four numbers: lessons confirmed and lesson credits used, credits granted and recorded paid amount, new booking requests and cancellations, and new students. Lessons SHALL count by their start time and only once confirmed; cancelled and unconfirmed lessons SHALL NOT count. Hired teachers SHALL NOT access the dashboard.

#### Scenario: Today's numbers
- **WHEN** the owner opens the dashboard after confirming two lessons today and granting a ten-lesson package with 1000 yuan recorded
- **THEN** today shows 2 lessons with their credits used, 10 credits granted and 1000 yuan recorded

#### Scenario: Undone confirmation
- **WHEN** the owner undoes the confirmation of a lesson and reopens the dashboard
- **THEN** that lesson no longer counts

#### Scenario: Switching period
- **WHEN** the owner switches from today to this month
- **THEN** the numbers cover the calendar month from the 1st in Beijing time

#### Scenario: Hired teacher
- **WHEN** a teacher without administrator status requests the dashboard
- **THEN** the request is refused with 403

### Requirement: Owner Sees Lessons by Teacher
When the studio has more than one active teacher, the dashboard SHALL list every active teacher with the lessons they taught and the credits used in the period, counting a substituted lesson for the teacher who taught it. A one-teacher studio SHALL NOT see this list.

#### Scenario: Two teachers
- **WHEN** the owner of a two-teacher studio opens this week
- **THEN** both teachers are listed with their lesson counts, including a teacher with none

#### Scenario: Solo studio
- **WHEN** the only teacher of a studio opens the dashboard
- **THEN** no teacher list is shown

### Requirement: Owner Sees Students Who Need to Renew
The dashboard SHALL list up to 20 students whose lessons are running low or expiring, using the same rule as renewal reminders, with low balances first, and each SHALL open that student's existing ledger.

#### Scenario: Student running low
- **WHEN** a student who has used most of a package has one lesson left
- **THEN** the student appears under needing renewal with the course and one lesson remaining
