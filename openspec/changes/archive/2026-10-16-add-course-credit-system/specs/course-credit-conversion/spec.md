## ADDED Requirements

### Requirement: Universal Credits Require Conversion
Universal credits MUST NOT reserve or consume a lesson and MUST be converted into the exact required course-credit type first.

#### Scenario: Student only has universal credits
- **WHEN** a lesson requires course type A and the student only has universal credits
- **THEN** the system offers an eligible conversion and does not directly freeze the universal batch

### Requirement: Directed Versioned Conversion Rules
Each conversion rule SHALL define source type, target type, positive integer source and target quantities, minimum step, effective dates, expiry policy, activation policy, direction, and immutable version.

#### Scenario: One A credit converts to two B credits
- **WHEN** an active rule defines `1 A -> 2 B` and the student converts one eligible A credit
- **THEN** the system removes one available A credit and grants two B credits under that rule version

#### Scenario: Rule is inactive
- **WHEN** a conversion request references a rule outside its effective period or with inactive status
- **THEN** the system rejects the request without changing any batch

### Requirement: Exact Integer Conversion Steps
The system MUST reject conversion quantities that are not an integer multiple of the rule's minimum source quantity.

#### Scenario: Fractional course credit conversion is requested
- **WHEN** a user requests 0.5 A credit or another unsupported partial step
- **THEN** the system rejects the conversion and preserves all source credits

### Requirement: Explicit or Authorized Implicit Consent
The system SHALL present source quantity, target quantity, ratio, expiry change, activation behavior, and reversibility before a user conversion, including conversion initiated during lesson reservation.

#### Scenario: Implicit conversion is confirmed during reservation
- **WHEN** matching course credits are insufficient but an eligible universal conversion exists
- **THEN** the system obtains current consent or a valid scoped auto-conversion authorization before executing conversion

#### Scenario: Material rule terms changed
- **WHEN** the ratio, expiry behavior, or activation behavior differs from the user's stored authorization
- **THEN** the system requires a new confirmation

### Requirement: Atomic Conversion and Reservation
Conversion and any immediately requested lesson reservation MUST execute in one database transaction.

#### Scenario: Reservation fails after conversion validation
- **WHEN** a conversion could succeed but the target lesson can no longer be reserved
- **THEN** the transaction rolls back the source deduction, target grant, and reservation attempt

### Requirement: Configurable Target Expiry
The system SHALL support `INHERIT_SOURCE`, `RESET_ON_CONVERSION`, `RESET_ON_ACTIVATION`, `MIN_SOURCE_AND_NEW`, and `TARGET_TERM_END` as versioned conversion expiry policies.

#### Scenario: Conversion inherits source expiry
- **WHEN** a conversion uses `INHERIT_SOURCE`
- **THEN** each target allocation retains the effective expiry derived from its source batch

#### Scenario: Conversion resets on activation
- **WHEN** a conversion uses `RESET_ON_ACTIVATION`
- **THEN** the target batch is created unactivated with its configured activation deadline and duration

### Requirement: Source Allocation Traceability
The system SHALL record which source batches funded each target batch and SHALL preserve different expiry or cost outcomes instead of blindly merging them.

#### Scenario: Conversion uses source batches with different expiry
- **WHEN** one conversion consumes source quantities from two batches with different expiry dates
- **THEN** the target output remains traceable to both sources and applies the configured expiry calculation to each allocation

### Requirement: Conversion Anti-Arbitrage
The system MUST validate directed conversion rules before publication and MUST reject any reachable cycle that can increase reference value or course-credit quantity without additional value.

#### Scenario: Profitable round trip is configured
- **WHEN** proposed A-to-B and B-to-A rules allow a user to return with more reference value than they started with
- **THEN** the system prevents publication and reports the detected cycle
