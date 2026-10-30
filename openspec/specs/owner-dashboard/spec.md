# owner-dashboard Specification

## Purpose
A small owner dashboard in the mini program. It covers today, this week or a chosen month: lessons taught, lessons granted, bookings and new students. Owners reconcile with each teacher through the lesson count and per-lesson detail, with no earnings figures. It also lists students who need renewal or have not been back for a while.

## Requirements
### Requirement: Owner Sees the Studio at a Glance
An administrator teacher SHALL be able to view, for today, this week or a calendar month (the current one or any earlier month) in Beijing time, four numbers: lessons confirmed and lesson credits used, credits granted, new booking requests and cancellations, and new students. Lessons SHALL count by their start time and only once confirmed; cancelled and unconfirmed lessons SHALL NOT count. The dashboard SHALL NOT show money amounts or teacher pay. Hired teachers SHALL NOT access the dashboard.

#### Scenario: Today's numbers
- **WHEN** the owner opens the dashboard after confirming two lessons today and granting a ten-lesson package
- **THEN** today shows 2 lessons with their credits used and 10 credits granted

#### Scenario: Undone confirmation
- **WHEN** the owner undoes the confirmation of a lesson and reopens the dashboard
- **THEN** that lesson no longer counts

#### Scenario: Switching period
- **WHEN** the owner switches from today to this month
- **THEN** the numbers cover the calendar month from the 1st in Beijing time

#### Scenario: Earlier month
- **WHEN** the owner steps back from this month to the previous calendar month
- **THEN** the numbers and the teacher lessons cover that month, and the owner can step forward again up to the current month but not beyond it

#### Scenario: Hired teacher
- **WHEN** a teacher without administrator status requests the dashboard
- **THEN** the request is refused with 403

### Requirement: Owner Reconciles Lessons by Teacher
When the studio has more than one active teacher, the dashboard SHALL list every active teacher with the lessons they taught and the credits used in the period, counting a substituted lesson for the teacher who taught it. The owner SHALL be able to open one teacher and see each confirmed lesson of the period with its time, course and students, without any pay amounts. A one-teacher studio SHALL NOT see this list.

#### Scenario: Two teachers
- **WHEN** the owner of a two-teacher studio opens this week
- **THEN** both teachers are listed with their lesson counts, including a teacher with none

#### Scenario: Reconciling with a teacher
- **WHEN** the owner opens a teacher's lessons for this month
- **THEN** every lesson that teacher confirmed this month is listed with its date, course and students, and the totals match the teacher's row

#### Scenario: Solo studio
- **WHEN** the only teacher of a studio opens the dashboard
- **THEN** no teacher list is shown

### Requirement: Owner Sees Students Who Need Attention
The dashboard SHALL list up to 20 students whose lessons are running low or expiring, using the same rule as renewal reminders, with low balances first. It SHALL also list up to 20 students who still hold lesson credits, have nothing booked ahead and have not had a lesson for 21 days (or, if they never had one, received their first credits 21 days ago), longest absence first. Each student SHALL open their existing ledger.

#### Scenario: Student running low
- **WHEN** a student who has used most of a package has one lesson left
- **THEN** the student appears under needing renewal with the course and one lesson remaining

#### Scenario: Student stopped coming
- **WHEN** a student with five lessons left last had a lesson 30 days ago and has nothing booked
- **THEN** the student appears under long absence with 30 days and five lessons remaining

#### Scenario: Student with a booking
- **WHEN** a student who last came 30 days ago has booked next week's lesson
- **THEN** the student is not listed under long absence

