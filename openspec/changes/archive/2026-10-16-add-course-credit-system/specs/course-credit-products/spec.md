## ADDED Requirements

### Requirement: Exact Course Credit Types
The system SHALL define each consumable course credit type against one exact course specification and SHALL require one integer course credit for one session unless the published specification explicitly changes that quantity.

#### Scenario: Different course specifications do not share credits
- **WHEN** a student owns credits for adult vocal one-to-one 60-minute lessons and attempts to reserve a sight-singing group session
- **THEN** the system rejects those credits as a type mismatch and does not freeze them

#### Scenario: Price change preserves the course credit type
- **WHEN** the price of an unchanged course specification is updated
- **THEN** the system creates a new price version without invalidating existing credits of that course type

### Requirement: Package Grant Composition
The system SHALL allow a package to grant one or more course-credit types with fixed integer quantities.

#### Scenario: Mixed package grants multiple batches
- **WHEN** a paid package grants eight vocal credits and two sight-singing credits
- **THEN** the system creates traceable grant batches for both credit types under the same order operation

### Requirement: Immutable Price Versions
The system SHALL snapshot list price, paid price, currency, grant lines, activation policy, and expiry policy when an order is created and SHALL NOT recalculate historical orders from current configuration.

#### Scenario: Discounted package retains cost basis
- **WHEN** a ten-session package with a list price of 3000 CNY is purchased for 2800 CNY
- **THEN** the resulting batch records ten credits, a 300 CNY list unit value, and a 280 CNY paid unit cost

### Requirement: Idempotent Order Grants
The system MUST grant credits at most once for each successful order or payment event.

#### Scenario: Duplicate payment notification is replayed
- **WHEN** the same successful provider payment event is delivered more than once
- **THEN** the system returns the original grant result and creates no additional batch or event

#### Scenario: Failed order grants nothing
- **WHEN** an order remains failed, cancelled, or unpaid
- **THEN** the system creates no course-credit batch

### Requirement: Direct Package and Universal Credit Purchases
The system SHALL grant course-specific credits directly for package purchases and SHALL grant non-consumable universal credits for universal-credit recharge products.

#### Scenario: Direct package purchase avoids visible intermediate credit
- **WHEN** a student purchases a course package directly
- **THEN** the system grants the configured course-specific batches without first changing the student's universal-credit balance

#### Scenario: Recharge grants universal credits
- **WHEN** a universal-credit recharge order is paid
- **THEN** the system grants a universal-credit batch that can be converted but cannot reserve a lesson
