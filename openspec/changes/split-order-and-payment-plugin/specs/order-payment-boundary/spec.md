## ADDED Requirements

### Requirement: Order Center Owns Goods Orders

The core order center SHALL own everything about goods orders: offers, placing orders, what a student bought, list, payable and paid amounts, the amount allocated to each line, refund and cancellation rules, refunded, pending and fee amounts, fulfillment, refund requests (`order_refunds`) with the credit they hold, and order queries. Each order and refund request SHALL record a settlement method of `offline` or `online`. Order center calculations SHALL read and write core data only.

#### Scenario: Cancelling a paid reservation
- **WHEN** a student cancels an appointment that used a lesson from a paid order
- **THEN** the order center prices the cancellation from the order's rules and records a refund request, without reading or writing payment plugin data

#### Scenario: Tenant without payment
- **WHEN** a tenant without the payment plugin has an order settled offline
- **THEN** its refund requests are recorded with offline settlement and its order queries work

### Requirement: Payment Plugin Handles Money Only

The payment plugin SHALL handle only money: payment transactions, refund transactions, payment and refund result queries, callbacks, reconciliation and money exceptions. A payment or refund transaction SHALL refer to the business document by its id and amount only. The plugin SHALL reach orders and refund requests only through commands the order center exports. Core packages MUST NOT import plugin packages, and the plugin MUST NOT access core collections directly; a static check SHALL enforce both. A capability that would need the core to call into it SHALL NOT be built as a plugin.

#### Scenario: Payment received
- **WHEN** the gateway confirms a payment for an order
- **THEN** the plugin reports it to the order center, which checks the amount and fulfils the order once even if the report repeats

#### Scenario: Amount mismatch
- **WHEN** the confirmed amount differs from the order's payable amount
- **THEN** the order center does not fulfil the order and the plugin records a money exception

#### Scenario: Core imports a plugin
- **WHEN** a core package imports a plugin package
- **THEN** the static check fails

### Requirement: Plugin Lifecycle

A tenant plugin SHALL be active, winding down or disabled. A plugin past its expiry time SHALL be treated as winding down. Routes SHALL declare the plugin capability they need. Routes that start a payment SHALL be available only while the plugin is active. Routes that query results, receive callbacks, execute refunds, recover or reconcile SHALL also be available while winding down. Order center routes that need no capability SHALL work in every state. Disabling a plugin SHALL be refused while an online refund request is still processing, because it may already be at the gateway, or while an online order is still inside its payment window. Disabling SHALL close unpaid online orders whose window has ended. Disabling SHALL turn the tenant's failed online reservation refunds, which are still owed, into offline ones. Orders and credit SHALL stay in the core in every state.

#### Scenario: Plugin expired
- **WHEN** a tenant's payment plugin has passed its expiry time
- **THEN** placing an order and starting a payment answer as not found, while the student can still see the order and request a refund that the plugin executes

#### Scenario: Disabling with a refund in flight
- **WHEN** the payment plugin is disabled while an online refund request is processing
- **THEN** the switch is refused and the plugin stays winding down, so the plugin finishes the refund and it is never paid twice

#### Scenario: Disabling with a failed reservation refund
- **WHEN** the payment plugin is disabled while a failed online reservation refund is still owed
- **THEN** the refund request becomes an offline one still processing and the student's order and credit stay unchanged

### Requirement: Payment Window From Checkout

An online order SHALL be payable for the payment window from checkout. While the plugin can start payments, it SHALL open the payment of each new order without waiting for the cashier, so the gateway closes it when the window ends. An order whose window ended without a payment SHALL be closed.

#### Scenario: Order never opened at the cashier
- **WHEN** a student places an order and never opens the cashier
- **THEN** the plugin opens its payment shortly after checkout and the order is closed when the payment window ends

#### Scenario: Order placed before a pause
- **WHEN** an order without a payment passes its window while selling is paused
- **THEN** the order is closed and its cashier answers that the payment time has passed

### Requirement: Platform Payment Pause

The platform SHALL be able to pause starting payments for every tenant at once. While paused, routes that start a payment SHALL answer as not found for every tenant, and routes that settle money already in flight SHALL keep working.

#### Scenario: Platform paused
- **WHEN** the platform pauses the payment plugin
- **THEN** opening a cashier and listing offers answer as not found, while checking a payment result, callbacks and refunds still work

### Requirement: Payment Entry Policy Set

The gateway exposure plan SHALL put the routes that open a cashier or check a payment result in their own batch attached to the `payment` policy set, so they can be throttled or stopped without touching other routes.

#### Scenario: Exposure plan checked
- **WHEN** the gateway exposure tests read the mini program plan
- **THEN** exactly the cashier and payment result routes carry the `payment` policy set

### Requirement: Unchanged Public Behaviour

Splitting the order center from payment SHALL keep every route path and response shape. Online refunds MAY be executed asynchronously after the request returns them as processing. The tiered commerce smoke test SHALL pass with the same journey and assertions, reading the new collections.

#### Scenario: Tiered commerce journey
- **WHEN** the commerce smoke test runs checkout, payment, tiered cancellation, failed refund recovery, gateway restart recovery and reconciliation
- **THEN** it passes with the same results as before the split
