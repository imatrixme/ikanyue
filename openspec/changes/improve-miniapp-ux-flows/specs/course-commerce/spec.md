## ADDED Requirements

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
