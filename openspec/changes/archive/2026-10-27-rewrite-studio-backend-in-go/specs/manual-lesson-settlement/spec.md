## MODIFIED Requirements

### Requirement: Atomic Manual Settlement
Confirmed attendance, student lesson-hour movements, actual teacher workload, lesson status, audit, and outbox events MUST commit atomically in one `kanyue.server` transaction.

#### Scenario: Teacher workload write fails
- **WHEN** a teacher workload write fails inside the settlement transaction
- **THEN** student lesson hours and lesson status remain unchanged
