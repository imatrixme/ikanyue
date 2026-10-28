## ADDED Requirements

### Requirement: Time Filters Compare Instants
Course-credit, booking, schedule and commerce queries SHALL compare `date` and `autodate` fields as instants. Every time value placed in a PocketBase filter SHALL first be normalized to the stored `YYYY-MM-DD HH:MM:SS.sssZ` format, whatever ISO form the caller provides.

#### Scenario: A batch expiring later the same day still serves an earlier lesson
- **WHEN** a lesson starts at 02:00 UTC and a batch expires at 10:00 UTC on the same day
- **THEN** lot selection treats the batch as valid for that lesson

#### Scenario: Pending appointments expire only after their deadline
- **WHEN** the expiry worker runs at 01:00 UTC and a pending appointment's response deadline is 09:00 UTC on the same day
- **THEN** the appointment stays pending

#### Scenario: Outbox respects the retry backoff
- **WHEN** an outbox event is scheduled to retry at 12:00 UTC and the dispatcher runs at 11:00 UTC on the same day
- **THEN** the event is not claimed

#### Scenario: Today's later lessons count as upcoming
- **WHEN** a student is enrolled at 01:00 UTC and their class has a lesson at 07:00 UTC on the same day
- **THEN** the lesson appears in their upcoming lessons and in the enrollment roster sync

#### Scenario: New filters cannot skip normalization
- **WHEN** code builds a filter that compares a time field with an interpolated value
- **THEN** the guard test fails unless the value passes through `filterTime`
