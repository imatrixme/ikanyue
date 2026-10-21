## Purpose

Isolate provider transactions and money reconciliation from course business rules while enabling realistic local testing without merchant credentials.

## ADDED Requirements

### Requirement: Authenticated channel-neutral payments
The gateway SHALL accept authenticated payment creation, lookup and closure with immutable positive integer minor-unit amounts, currency, business references and idempotency keys, and SHALL own its storage independently.

#### Scenario: Conflicting retry
- **WHEN** a client reuses an idempotency key with a different amount or reference
- **THEN** the gateway rejects the request without a second transaction

#### Scenario: Unauthorized access
- **WHEN** a request lacks valid service credentials or targets another client's payment
- **THEN** the gateway denies access and exposes no transaction details

### Requirement: Bounded durable refunds
The gateway SHALL give refunds separate identifiers and states and SHALL reserve pending refund amounts against captured funds atomically.

#### Scenario: Concurrent refund requests
- **WHEN** simultaneous requests together exceed the unrefunded captured amount
- **THEN** at most the valid amount is reserved and the excess request is rejected

#### Scenario: Unknown refund result
- **WHEN** the provider response is lost
- **THEN** the refund stays recoverable by the same identifier and is not duplicated or reported successful

### Requirement: Recoverable events and reconciliation
The gateway SHALL persist transaction events and pending work, deliver events at least once with stable identifiers, and reconcile provider observations without rewriting historical facts.

#### Scenario: Restart after capture
- **WHEN** the gateway restarts after payment succeeds before business acknowledgement
- **THEN** the successful payment remains queryable and its event can be delivered again

#### Scenario: Provider mismatch
- **WHEN** a provider bill differs from the gateway ledger
- **THEN** the difference is visible as an unresolved reconciliation finding

### Requirement: Isolated mock provider
The test gateway SHALL simulate provider state independently of business records, including failed, late and duplicate outcomes, and SHALL NOT allow mock operation in production.

#### Scenario: Production mock configuration
- **WHEN** production starts with a mock provider
- **THEN** startup fails closed before serving payments

#### Scenario: Late paid observation
- **WHEN** a success is observed after a payment was considered closed
- **THEN** the gateway preserves the receipt and emits a recoverable exception rather than discarding money

### Requirement: WeChat protocol with isolated response mocking
The gateway SHALL execute WeChat API v3 signing, response verification, notification decryption and state normalization through an injected HTTP transport while local development mocks only the channel peer and its responses. Runtime SHALL NOT enable live WeChat charging in this milestone.

#### Scenario: Tampered or misbound notification
- **WHEN** a notification has an invalid signature, expired timestamp, incorrect merchant/app/payer, mismatched identifiers or amounts
- **THEN** no payment or refund success is applied

#### Scenario: Ambiguous channel result
- **WHEN** a request times out after the mock channel accepts it or a refund becomes abnormal
- **THEN** the existing merchant identifier remains recoverable and refund principal stays reserved

#### Scenario: Mock restart
- **WHEN** the gateway restarts between channel acceptance and receipt processing
- **THEN** the channel's persisted record remains available through a signed query and no duplicate charge or refund is created

#### Scenario: Bill download
- **WHEN** signed metadata specifies a bill download
- **THEN** only an allowlisted channel URL is used and the downloaded bytes must match the advertised hash
