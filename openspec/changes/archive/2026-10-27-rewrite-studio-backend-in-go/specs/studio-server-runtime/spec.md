## ADDED Requirements

### Requirement: Single Business Server

The business backend SHALL run as one Go program (`kanyue.server`) that embeds PocketBase v0.32.0 and opens the existing business `pb_data` directly, without a data migration. It SHALL be the only business API process. The payment gateway SHALL stay a separate program with its own database.

#### Scenario: Existing data
- **WHEN** `kanyue.server` starts on a copy of the production business `pb_data`
- **THEN** all existing records are readable and no collection is recreated or dropped

### Requirement: Transactional Writes

Every business command that writes more than one record SHALL commit all writes in one database transaction or none of them.

#### Scenario: Failure mid-command
- **WHEN** a settlement fails after updating some ledger records
- **THEN** none of that command's writes are visible afterwards

### Requirement: Contract Compatibility

Business endpoints SHALL keep the paths, request shapes, the `{code, message, data}` envelope with `code=10000` on success, HTTP 200 on business errors, error codes and data masking, that the mini program, website and payment gateway were built against, so those clients need no change.

#### Scenario: Same data, same answer
- **WHEN** the contract suite (`kanyue.server/contract`) calls a read endpoint with a recorded request
- **THEN** the response matches the recorded envelope, fields and masking

### Requirement: Token Compatibility

`kanyue.server` SHALL sign and verify tokens with the same `JWT_SECRET`, algorithm, claims and lifetimes as the tokens already issued to clients. Ops endpoints SHALL require `scope: "ops"`, and identity-challenge tokens SHALL NOT authenticate.

#### Scenario: No forced re-login
- **WHEN** a student who logged in before the switch to `kanyue.server` calls a business endpoint
- **THEN** the request is authenticated with the existing token

### Requirement: Explicit Route Ownership

Every business route SHALL be registered by exactly one `kanyue.server` module. Routes without an owner SHALL answer the 404 envelope; the server SHALL NOT forward requests to another business API.

#### Scenario: Endpoint without a caller
- **WHEN** a client calls an endpoint that no client used and that was therefore not carried over, such as `/v1/course-credits/summary` or `/swagger`
- **THEN** `kanyue.server` answers 404 without contacting any upstream

### Requirement: Internal-Only Storage Interfaces

PocketBase's built-in `/api/*` and dashboard `/_/` SHALL be reachable only by internal callers and SHALL NOT be reachable through the public reverse proxy, except `GET`/`HEAD /api/files/*`. Collection API rules SHALL remain superuser-only. The dashboard is for inspection; business writes SHALL go through business endpoints.

#### Scenario: Public request to storage API
- **WHEN** a request forwarded by the public proxy targets `/api/collections/students/records`
- **THEN** it is rejected without revealing data

### Requirement: Explicit Schema Migration

Schema changes SHALL be versioned Go migrations applied by an explicit `migrate up` command and SHALL be idempotent on existing databases. On an empty data directory `migrate up` SHALL create every business collection. Startup SHALL NOT migrate automatically and SHALL refuse to start while a Go migration is pending.

#### Scenario: Fresh install
- **WHEN** `migrate up` runs on an empty data directory
- **THEN** every business collection exists and the server starts

#### Scenario: Release order
- **WHEN** a release adds a migration and `migrate up` has not been run
- **THEN** the server refuses to start and names the pending migration

### Requirement: In-Process Scheduled Jobs

Booking expiry and fulfilment, credit expiry, outbox delivery and payment recovery SHALL run as idempotent in-process scheduled jobs with bounded batches, and SHALL remain manually triggerable by ops.

#### Scenario: Restart during a job
- **WHEN** the server restarts in the middle of a job run
- **THEN** the next run completes the remaining work without double-applying any change
