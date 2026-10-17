## ADDED Requirements

### Requirement: Separate Course Credit Ledger
The system SHALL maintain course credits in a ledger that is independent from physical reward points and legacy student or teacher `hours` fields.

#### Scenario: Physical reward points are not course credits
- **WHEN** a student has sufficient physical reward points but no matching course credits
- **THEN** the system reports the lesson as course-credit insufficient

### Requirement: Batch Quantity Conservation
Every course-credit batch MUST preserve the invariant that original quantity equals available, frozen, consumed, expired, and reversed quantities combined, and every quantity MUST remain a non-negative integer.

#### Scenario: Batch is partially frozen and consumed
- **WHEN** two credits are frozen and one of those credits is consumed
- **THEN** the batch moves one unit from frozen to consumed without changing original quantity

#### Scenario: Negative batch state is attempted
- **WHEN** an operation would make any batch quantity negative
- **THEN** the entire operation is rejected and no ledger record changes

### Requirement: Explicit Activation Policies
Each batch SHALL snapshot one explicit activation mode from `GRANT_TIME`, `FIRST_RESERVATION`, `FIRST_CHECK_IN`, `FIRST_COMPLETED_SESSION`, or `TERM_START`.

#### Scenario: First check-in activates a rolling package
- **WHEN** an unactivated `FIRST_CHECK_IN` batch is used by a student who completes a valid check-in
- **THEN** the system records the activation time and calculates the effective expiry exactly once

#### Scenario: Cancelled reservation does not activate first-check-in batch
- **WHEN** a provisional reservation is cancelled before check-in
- **THEN** the batch remains unactivated and the provisional freeze is released

### Requirement: Activation Deadline
An unactivated batch MUST have an activation deadline and MUST expire or become unusable if that deadline passes without its activation event.

#### Scenario: Activation deadline passes
- **WHEN** an unactivated batch reaches its activation deadline without a valid activation event
- **THEN** the system prevents new reservation and conversion use of its remaining quantity

### Requirement: Service-Time Expiry
The system SHALL evaluate credit validity against the lesson session start time using `valid_from <= session.start_at < effective_expires_at`.

#### Scenario: Settlement occurs after expiry
- **WHEN** a credit was valid and frozen for a lesson before expiry but the lesson is settled after expiry
- **THEN** the system consumes the frozen credit successfully

#### Scenario: Future lesson falls after expiry
- **WHEN** a student attempts to reserve a lesson whose start time is at or after the batch expiry
- **THEN** the system does not allocate that batch

### Requirement: Audited Expiry Extension
The system SHALL preserve original expiry and SHALL record every extension with old expiry, new expiry, reason, operator, and approval context.

#### Scenario: Active remaining credits are extended
- **WHEN** an authorized operator extends an active batch
- **THEN** only remaining eligible quantity uses the new effective expiry and the original expiry remains auditable

#### Scenario: Expired credit is restored
- **WHEN** an operator decides to restore already expired quantity
- **THEN** the system creates an explicit compensation batch instead of deleting the expiry event

### Requirement: Immutable Events and Reconciliation
The system SHALL append a credit event for every quantity movement and SHALL support rebuilding expected batch quantities from events and allocations.

#### Scenario: Snapshot differs from rebuilt ledger
- **WHEN** reconciliation finds a difference between a batch snapshot and its events
- **THEN** the system records an exception for review and does not silently rewrite historical events
