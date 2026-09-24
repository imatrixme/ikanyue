## ADDED Requirements

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
