## MODIFIED Requirements

### Requirement: Appointment Audit, Expiry, and Notifications
The system SHALL append immutable appointment events and use `kanyue.server` in-process scheduled jobs plus Outbox records for pending expiry and external notifications.

#### Scenario: Pending request reaches its response deadline
- **WHEN** the in-process appointment-expiry job, or its manual ops trigger, runs after a pending request deadline
- **THEN** `kanyue.server` marks the request expired, appends an event, and enqueues a notification in one transaction, without PocketBase JS hooks

#### Scenario: Appointment state changes
- **WHEN** an appointment is requested, confirmed, declined, withdrawn, cancelled, rescheduled, or fulfilled
- **THEN** the system records actor, transition, timestamp, safe reason, aggregate identifiers, and trace information
