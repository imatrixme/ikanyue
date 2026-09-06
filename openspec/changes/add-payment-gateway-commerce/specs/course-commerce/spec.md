## Purpose

Let learners buy clearly priced courses and manage reservations and refunds using stable policies rather than personal price negotiations.

## ADDED Requirements

### Requirement: Fixed-price checkout and trusted grants
The business system SHALL derive checkout amounts from published catalog versions, preserve purchase snapshots and grant exact course credits only after verified gateway receipt.

#### Scenario: Duplicate receipt
- **WHEN** a paid gateway event is received more than once
- **THEN** the order receives exactly one set of course credits

#### Scenario: Frontend reports success
- **WHEN** the frontend reports payment success without a confirmed gateway receipt
- **THEN** the order remains pending verification and grants nothing

### Requirement: Transparent order-scoped refund rules
The business system SHALL preview cancellation deadlines and refund amounts using immutable order rules, server receipt time and original paid allocations, separately from cancellation of an entire package.

#### Scenario: Deadline boundary
- **WHEN** a cancellation arrives exactly at a policy threshold
- **THEN** the documented inclusive tier is applied regardless of later approval time

#### Scenario: Discount and existing refunds
- **WHEN** a discounted order is partially consumed or previously refunded
- **THEN** refunds do not exceed remaining paid principal, produce negative amounts, duplicate deductions or create consumer debt

#### Scenario: Reserved entitlement
- **WHEN** a refund concerns credits with future reservations
- **THEN** affected reservations are disclosed and resolved before those credits can be refunded

### Requirement: Human-readable commerce workflows
Students SHALL see catalog choices, final prices, policy summaries, payment/refund states and their own orders; authorized Admin users SHALL see operational exceptions and financial facts without arbitrary ordinary-sale price overrides.

#### Scenario: Refund processing
- **WHEN** a refund is accepted but not yet confirmed by the provider
- **THEN** both interfaces display processing rather than refunded

### Requirement: Historical payment provenance
Historical personal transfers SHALL retain offline provenance and SHALL NOT be represented as company gateway receipts.

#### Scenario: Offline-origin refund
- **WHEN** an operator requests a gateway refund for a historical personal transfer
- **THEN** the system rejects automatic gateway execution and preserves the manual handling record

### Requirement: Complete operator order and refund workflow
Authorized operators SHALL search paginated business orders, inspect entitlement/payment/refund history and initiate rule-based refunds with confirmed amounts, authenticated actors and mandatory reasons. Published online offers SHALL preserve purchase-time pricing and policy snapshots.

#### Scenario: Operator submits a stale refund quote
- **WHEN** entitlement or refundable principal changes after the preview
- **THEN** submission is rejected and the operator must review a new quote

#### Scenario: Retired offer
- **WHEN** an offer is withdrawn or a new policy is published
- **THEN** new checkout follows publication status while existing orders retain their original policy

#### Scenario: Cash reservation cancellation
- **WHEN** a learner confirms a cash cancellation quote
- **THEN** booking cancellation, retirement of its lesson credit and refund liability are committed atomically and the learner cannot receive both cash and a reusable lesson

### Requirement: Auditable operations and release readiness
The system SHALL expose recoverable exceptions and statement differences with safe retries and evidence-backed resolution. Production configuration SHALL require explicit live-payment authorization and SHALL NOT infer readiness from mock tests.

#### Scenario: Provider statement mismatch
- **WHEN** verified statement values disagree with local payment/refund records
- **THEN** the difference remains visible with its source evidence until explicitly resolved; it does not overwrite money records
