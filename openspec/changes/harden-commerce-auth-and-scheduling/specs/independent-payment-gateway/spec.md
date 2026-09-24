## ADDED Requirements

### Requirement: Unpaid payment expiry
The gateway SHALL give every payment a 30-minute payment window, pass it to the channel, and close still-pending payments after it elapses.

#### Scenario: Abandoned payment
- **WHEN** a payment remains pending 30 minutes after creation
- **THEN** the gateway closes it with the channel, records `closed` and emits `payment.closed`

#### Scenario: Late success after close
- **WHEN** the channel later reports success for a closed payment
- **THEN** the existing late-payment path records the success and a reconciliation finding

### Requirement: Bounded recovery scanning
Polling SHALL read only pending payments, processing refunds, provider results not yet applied and unacknowledged events, not every historical record.

#### Scenario: Completed history
- **WHEN** thousands of payments are completed
- **THEN** a polling cycle performs no per-record reads for them
