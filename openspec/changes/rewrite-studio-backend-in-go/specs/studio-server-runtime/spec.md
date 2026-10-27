## ADDED Requirements

### Requirement: Single Business Server

The business backend SHALL run as one Go program (`kanyue.server`) that embeds PocketBase v0.32.0 and opens the existing business `pb_data` directly, without a data migration. The payment gateway SHALL stay a separate service with its own database.

#### Scenario: Existing data
- **WHEN** `kanyue.server` starts on a copy of the production business `pb_data`
- **THEN** all existing records are readable and no collection is recreated or dropped

### Requirement: Transactional Writes

Every business command that writes more than one record SHALL commit all writes in one database transaction or none of them.

#### Scenario: Failure mid-command
- **WHEN** a settlement fails after updating some ledger records
- **THEN** none of that command's writes are visible afterwards

### Requirement: Contract Compatibility

Migrated endpoints SHALL keep the existing paths, request shapes, the `{code, message, data}` envelope with `code=10000` on success, HTTP 200 on business errors, error codes and data masking, so the mini program, website and payment gateway need no change.

#### Scenario: Same data, same answer
- **WHEN** the contract suite calls a migrated read endpoint on Hono and on `kanyue.server` against the same data
- **THEN** both responses are equal

### Requirement: Token Compatibility

`kanyue.server` SHALL sign and verify tokens with the same `JWT_SECRET`, algorithm, claims and lifetimes as Hono. Ops endpoints SHALL require `scope: "ops"`, and identity-challenge tokens SHALL NOT authenticate.

#### Scenario: No forced re-login
- **WHEN** a student who logged in through Hono calls an endpoint now served by `kanyue.server`
- **THEN** the request is authenticated with the existing token

### Requirement: Incremental Route Ownership

`kanyue.server` SHALL serve the endpoints of migrated modules and reverse-proxy every other `/v1`, `/ops` and `/internal` request to Hono unchanged. An operator SHALL be able to hand a migrated module back to Hono through configuration without a data change.

#### Scenario: Unmigrated endpoint
- **WHEN** a client calls an endpoint whose module is not migrated
- **THEN** Hono answers it and the client sees the same response as before

#### Scenario: Module rollback
- **WHEN** an operator lists a migrated module in `KANYUE_HONO_MODULES` and restarts
- **THEN** that module's endpoints are served by Hono again

### Requirement: Internal-Only Storage Interfaces

PocketBase's built-in `/api/*` and dashboard `/_/` SHALL be reachable only by internal callers and SHALL NOT be reachable through the public reverse proxy. Collection API rules SHALL remain superuser-only.

#### Scenario: Public request to storage API
- **WHEN** a request forwarded by the public proxy targets `/api/collections/students/records`
- **THEN** it is rejected without revealing data

### Requirement: Explicit Schema Migration

Schema changes SHALL be versioned Go migrations applied by an explicit `migrate up` command and SHALL be idempotent on existing databases. Startup SHALL NOT migrate automatically and SHALL refuse to start when a required collection is missing.

#### Scenario: Release order
- **WHEN** a release adds a collection and `migrate up` has not been run
- **THEN** the server refuses to start and names the missing collection

### Requirement: In-Process Scheduled Jobs

Booking expiry and fulfilment, credit expiry, outbox delivery and payment recovery SHALL run as idempotent in-process scheduled jobs with bounded batches, and SHALL remain manually triggerable by ops.

#### Scenario: Restart during a job
- **WHEN** the server restarts in the middle of a job run
- **THEN** the next run completes the remaining work without double-applying any change
