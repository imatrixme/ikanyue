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

