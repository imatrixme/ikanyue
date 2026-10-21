# course-commerce Specification

## Purpose
TBD - created by archiving change harden-commerce-auth-and-scheduling. Update Purpose after archive.
## Requirements
### Requirement: Non-blocking event recovery
Business recovery SHALL acknowledge gateway events whose reference matches no commerce order or refund, so irrelevant events cannot occupy the pending-event window.

#### Scenario: Orphan event
- **WHEN** recovery reads an event whose reference has no business record
- **THEN** it acknowledges the event

### Requirement: Status-appropriate student order actions
The miniapp order page SHALL show only actions valid for the order state, with refund as a lower-emphasis action, and SHALL offer re-purchase for orders whose payment did not complete.

#### Scenario: Unfinished payment
- **WHEN** an order is `failed` because its payment window closed
- **THEN** the page explains the payment was not completed and offers 重新选购

#### Scenario: Completed order
- **WHEN** an order is completed
- **THEN** status refresh is not offered as a primary action

### Requirement: Focused Admin payments workspace
Admin 收款与退款 SHALL expose four views (订单管理, 待处理, 课程商品, 账单对账), a single sync-and-reconcile action, and its own navigation group.

#### Scenario: Operator checks a refund
- **WHEN** an operator needs a refund's status
- **THEN** it is found in the order dialog, not in a separate duplicate list

### Requirement: Single cancellation preview
Students SHALL preview appointment cancellation fees and refunds only through `GET /v1/student/appointments/:appointmentId/cancellation-preview`; the commerce module SHALL NOT expose a second route for the same quote.

#### Scenario: Cash-paid appointment
- **WHEN** a student opens cancellation for an appointment paid with a cash-refundable package
- **THEN** the booking preview returns the refundable amount and fee, and no commerce-prefixed preview route exists

### Requirement: Reuse pending order
Student order payloads SHALL include `offerId`. When a student buys an offer that already has a pending order, the miniapp SHALL open the existing order instead of creating another.

#### Scenario: Unpaid order exists
- **WHEN** a student taps "购买" on an offer with a pending order
- **THEN** the miniapp opens that pending order and no new order is created

### Requirement: Pending order notice
Pending orders SHALL tell the student that unpaid orders close automatically 30 minutes after creation.

#### Scenario: Viewing a pending order
- **WHEN** a student opens a pending order
- **THEN** the page states that the order closes automatically if unpaid within 30 minutes

### Requirement: Calm shop refresh
After its first load, the shop SHALL refresh in place without replacing the content with a loading state.

#### Scenario: Back from an order
- **WHEN** the student returns from an order page to the shop
- **THEN** the current list stays visible while it refreshes

### Requirement: Shallow booking hand-off
"选择时间预约" on an order SHALL replace the order page with the booking page.

#### Scenario: Book after purchase
- **WHEN** the student taps "选择时间预约"
- **THEN** the booking page replaces the order page, and back returns to the shop

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

