## ADDED Requirements

### Requirement: Automatic Renewal Reminders

The system SHALL scan student course balances once per day at 10:00 Asia/Shanghai and create a renewal reminder when a course that has already used or lost lessons has at most 2 remaining lessons (`low_balance`), or a batch still holding lessons expires within 14 days (`expiring`), and the course has no batch awaiting activation. A course whose newest grant expired with nothing left SHALL NOT be reminded automatically. A rerun on the same day SHALL NOT create a second reminder.

#### Scenario: Lessons running low
- **WHEN** a student's course has 2 remaining lessons after earlier lessons were used
- **THEN** the daily scan creates one automatic reminder with reason `low_balance`

#### Scenario: Fresh trial
- **WHEN** a student has just been granted a 2-lesson course and has used none
- **THEN** no automatic reminder is created

#### Scenario: Round limit
- **WHEN** three automatic reminders were already created for the same course since its latest grant
- **THEN** the scan creates no further automatic reminder for that course

#### Scenario: Cooldown suppresses repeats
- **WHEN** an automatic reminder for the same student and course was created within the cooldown period
- **THEN** the scan does not create another automatic reminder

#### Scenario: Renewal ends the round
- **WHEN** a new credit grant for that course lands after the last reminder
- **THEN** the reminder round closes and no further automatic reminder is created until the balance runs low again

### Requirement: Manual Renewal Reminders

Operators SHALL be able to send a renewal reminder to one or more students from a "待续费" list in Admin, and every manual reminder SHALL record the operator.

#### Scenario: Batch send
- **WHEN** an operator selects three students and sends reminders
- **THEN** three reminders with trigger `manual` and the operator id are recorded

#### Scenario: Daily limit
- **WHEN** a student already received a manual reminder today (Asia/Shanghai date)
- **THEN** another manual send for that student is rejected with a readable reason and nothing is recorded as sent

### Requirement: Teacher Read-Only Renewal List

Teachers SHALL see which of their own students (on their recent or upcoming lesson rosters) are due for renewal, with course, reason, remaining lessons or expiry date. Teachers SHALL NOT be able to send renewal reminders or see reminder history.

#### Scenario: Teacher views due students
- **WHEN** a teacher opens the workbench and one of their students has 1 remaining lesson
- **THEN** the student appears in the "待续费学员" list without any send action

#### Scenario: Teacher tries to send
- **WHEN** a teacher session calls the ops send endpoint
- **THEN** the request is rejected and no reminder is recorded

### Requirement: Price-Free Reminder Content

Reminder content SHALL be signed as 看乐教务, SHALL state only remaining lessons and the expiry date, and SHALL link to the fixed-price course package page; it SHALL NOT contain prices, discounts or a teacher's personal name.

#### Scenario: Student opens a reminder
- **WHEN** a student taps a renewal reminder
- **THEN** the course package page opens, showing published fixed prices

### Requirement: Reminder Delivery and Audit

Every reminder SHALL be delivered in-app, and MAY additionally be delivered by WeChat subscribe message when a template is configured and the student has an unused one-time subscribe grant. Each accepted subscribe prompt SHALL add one grant and each WeChat send SHALL use one. Each delivery attempt SHALL be recorded with status `sent`, `skipped` or `failed`, and an external channel failure SHALL NOT block the in-app reminder.

#### Scenario: No subscribe permission
- **WHEN** a reminder is created for a student who has not granted subscribe permission
- **THEN** the in-app reminder is shown and the WeChat attempt is recorded as `skipped`

#### Scenario: Template not configured
- **WHEN** no subscribe template is configured
- **THEN** every WeChat attempt is recorded as `skipped` and the mini program shows no subscribe entry

#### Scenario: WeChat refuses
- **WHEN** WeChat answers a send with an error
- **THEN** the attempt is recorded as `failed` with the error and the in-app reminder stays unread
