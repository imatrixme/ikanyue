## ADDED Requirements

### Requirement: Manual Attendance Entry
Authorized teachers or academic operators SHALL record present, late, approved leave, absent, or cancelled attendance without requiring QR check-in.

#### Scenario: Operator marks all present
- **WHEN** the operator uses the bulk present action on an unsettled lesson
- **THEN** every eligible roster entry becomes present and individual exceptions can still be changed before settlement

### Requirement: Settlement Preview
Admin SHALL show a server-authoritative preview of each student's lesson-hour consume, release, or exception result and each actual teacher's pending workload before settlement.

#### Scenario: Student has approved leave
- **WHEN** the active lesson rule releases approved leave
- **THEN** the preview shows one scheduled lesson hour returning to the student's course without mutating storage

### Requirement: Atomic Manual Settlement
Confirmed attendance, student lesson-hour movements, actual teacher workload, lesson status, audit, and outbox events MUST commit atomically through Hono.

#### Scenario: Teacher workload write fails
- **WHEN** a teacher workload request fails in the settlement Batch
- **THEN** student lesson hours and lesson status remain unchanged

### Requirement: Settlement Correction
Settled lessons SHALL be corrected only through reversal and re-settlement, never by editing original lesson-hour or teacher events.

#### Scenario: Attendance is corrected
- **WHEN** an authorized operator changes a settled student's attendance result
- **THEN** Admin previews and confirms reversal followed by a new settlement while preserving the original history

### Requirement: QR Check-In Deferred
The first release SHALL NOT require or expose QR check-in, attendance-device binding, or check-in-driven automatic settlement.

#### Scenario: Lesson reaches its end time
- **WHEN** no QR check-in data exists
- **THEN** the lesson remains awaiting manual attendance and settlement rather than inferring attendance

