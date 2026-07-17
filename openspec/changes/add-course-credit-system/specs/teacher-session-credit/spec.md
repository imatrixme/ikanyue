## ADDED Requirements

### Requirement: Independent Teacher Credit Ledger
The system SHALL maintain teacher session credits independently from student course-credit accounts and legacy `teachers.hours`.

#### Scenario: Student and teacher quantities differ
- **WHEN** eight students each consume one course credit in a class taught by one lead and one assistant
- **THEN** teacher earnings are calculated from teacher rules and are not required to total eight

### Requirement: Actual Teacher and Role Calculation
The system SHALL calculate teacher credits from actual session teacher assignments, role, course specification, and the published teacher rule version.

#### Scenario: Substitute replaces default teacher
- **WHEN** the substitute is confirmed as the actual lead teacher
- **THEN** the substitute receives the pending teacher credit and the absent default teacher does not

#### Scenario: Multiple teachers participate
- **WHEN** a lead and assistant both teach a session
- **THEN** the system creates separate pending earnings under their respective role rules

### Requirement: Pending Then Confirmed Earnings
Completing a session SHALL create pending teacher earnings, and only an authorized confirmation SHALL make them confirmed.

#### Scenario: Lesson completion creates pending earning
- **WHEN** a valid session is completed and settled
- **THEN** each eligible actual teacher receives a pending earning linked to that session

### Requirement: Cancelled Session Teacher Policy
An institution-cancelled session SHALL create no normal teacher earning unless a versioned compensation rule explicitly applies.

#### Scenario: Session is cancelled without compensation
- **WHEN** operations cancels a scheduled session before completion
- **THEN** the system creates no teacher earning event

### Requirement: Teacher Credit Reversal
Teacher credit corrections SHALL append reversal events linked to the original earning and SHALL NOT delete confirmed history.

#### Scenario: Settled teacher assignment was wrong
- **WHEN** an authorized operator corrects the actual teacher after settlement
- **THEN** the system reverses the original teacher earning and creates the corrected earning through re-settlement
