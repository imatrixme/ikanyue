## ADDED Requirements

### Requirement: Automatic Renewal Reminders

The system SHALL scan student course balances once per day at a configured academy time and create a renewal reminder when a course has remaining lessons at or below the configured threshold, or expires within the configured warning window, and has no batch awaiting activation.

#### Scenario: Lessons running low
- **WHEN** a student's course has 2 remaining lessons and the threshold is 2
- **THEN** the daily scan creates one automatic reminder with reason `low_balance`

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
- **WHEN** a student already received a manual reminder today
- **THEN** another manual send for that student is rejected with a readable reason and nothing is recorded as sent

### Requirement: Price-Free Reminder Content

Reminder content SHALL be signed as 看乐教务, SHALL state only remaining lessons and the expiry date, and SHALL link to the fixed-price course package page; it SHALL NOT contain prices, discounts or a teacher's personal name.

#### Scenario: Student opens a reminder
- **WHEN** a student taps a renewal reminder
- **THEN** the course package page opens, showing published fixed prices

### Requirement: Reminder Delivery and Audit

Every reminder SHALL be delivered in-app, and MAY additionally be delivered by WeChat subscribe message when the student has granted permission. Each delivery attempt SHALL be recorded with status `sent`, `skipped` or `failed`, and an external channel failure SHALL NOT block the in-app reminder.

#### Scenario: No subscribe permission
- **WHEN** a reminder is created for a student who has not granted subscribe permission
- **THEN** the in-app reminder is shown and the WeChat attempt is recorded as `skipped`
