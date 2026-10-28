# payment-gateway-runtime Specification

## Purpose
TBD - created by archiving change rewrite-studio-backend-in-go. Update Purpose after archive.
## Requirements
### Requirement: Single Gateway Binary

The payment gateway SHALL run as one Go program that embeds PocketBase v0.32.0 with its own data directory, separate from the business data, and SHALL keep the existing HTTP contract (`/v1/*` with `PAY_SERVICE_TOKEN`, `/callbacks/wechatpay`, `/health`, `/ready`, and the mock-only `/_test/*` routes).

#### Scenario: Existing payment data
- **WHEN** the Go gateway starts on a copy of the payment PocketBase data written by the TypeScript gateway
- **THEN** existing payments, refunds, events, work items and statements are read without change

#### Scenario: Business server unchanged
- **WHEN** `kanyue.server` creates, refreshes and refunds a payment against the Go gateway
- **THEN** it uses the same requests and receives the same responses as before

### Requirement: Internal-Only Gateway Dashboard

The gateway's PocketBase `/api/*` and dashboard `/_/` SHALL be reachable only by internal callers, and SHALL NOT be reachable through the public reverse proxy.

#### Scenario: Public dashboard request
- **WHEN** a request forwarded by the public proxy targets `/_/` on the gateway
- **THEN** it is rejected without revealing data

### Requirement: Explicit Gateway Schema Migration

The gateway schema SHALL be versioned Go migrations applied by an explicit `migrate up` command, idempotent on existing payment databases, and the gateway SHALL refuse to serve while a migration is pending.

#### Scenario: Fresh gateway
- **WHEN** `migrate up` runs on an empty gateway data directory
- **THEN** every gateway collection exists and the gateway starts

