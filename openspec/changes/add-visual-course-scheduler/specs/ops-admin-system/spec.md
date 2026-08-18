## ADDED Requirements

### Requirement: Teacher-Scoped Admin Calendar Access
The operations system SHALL allow a verified teacher with teacher capability to access the Admin calendar while keeping institution-wide reads and academic lesson mutations unavailable.

#### Scenario: Teacher requests the Ops calendar
- **WHEN** a teacher-only operator requests the Ops calendar for a valid range
- **THEN** the server returns only sessions assigned to the authenticated teacher with no lessons assigned solely to other teachers

#### Scenario: Teacher attempts an academic lesson command
- **WHEN** a teacher-only operator attempts to create, publish, reschedule, or cancel a lesson through an academic command
- **THEN** the server rejects the command with the existing course-credit capability error

#### Scenario: Academic operator requests the Ops calendar
- **WHEN** an academic operator requests the Ops calendar
- **THEN** the server retains the institution-wide projection and filter behavior

