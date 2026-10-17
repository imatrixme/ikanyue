## ADDED Requirements

### Requirement: Academy clock in the miniapp
The miniapp SHALL display and compose lesson, appointment, availability, points and activity times on the academy clock (Asia/Shanghai, UTC+08:00, the same clock the API books on), independent of the device timezone.

#### Scenario: Device in another timezone
- **WHEN** a device set to UTC shows an appointment starting at `2026-10-20T01:00:00Z`
- **THEN** it shows 10月20日 09:00

#### Scenario: Teacher picks a time
- **WHEN** a teacher on any device picks 2026-10-20 09:00 for an availability override or a reschedule
- **THEN** the submitted instant is `2026-10-20T01:00:00.000Z`

### Requirement: Retry-safe booking commands
The miniapp SHALL reuse the same idempotency key when retrying the same booking command for the same user and draft, and SHALL issue a new key only after the server has answered.

#### Scenario: Lost response
- **WHEN** a student's appointment request reaches the server but the response is lost, and the student taps submit again for the same slot
- **THEN** the retry carries the original key and receives the original result

#### Scenario: Different account on the same device
- **WHEN** another user signs in on the device
- **THEN** pending keys from the previous user are not reused
