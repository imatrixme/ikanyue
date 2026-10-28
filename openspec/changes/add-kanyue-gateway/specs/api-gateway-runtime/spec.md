## ADDED Requirements

### Requirement: Gateway serves traffic from an immutable versioned snapshot
The gateway data plane SHALL route requests using only an in-memory, immutable configuration snapshot compiled at publish time, and SHALL NOT read the configuration database while serving a request.

#### Scenario: Publish swaps the snapshot atomically
- **WHEN** an operator publishes a new configuration version
- **THEN** the control plane validates and compiles it, the data plane switches to the new snapshot atomically, and in-flight requests finish on the snapshot they started with

#### Scenario: Invalid configuration is rejected
- **WHEN** a publish contains a route conflict, an invalid plugin configuration, or a reference to a missing service or operation
- **THEN** the publish fails with the reasons and the running snapshot is unchanged

#### Scenario: Rollback restores a previous version
- **WHEN** an operator rolls back to an earlier version
- **THEN** that version becomes the running snapshot and the rollback is recorded in the audit log

#### Scenario: Start with last known good snapshot
- **WHEN** the gateway starts and the control plane cannot load or compile the configuration
- **THEN** the data plane serves the last successfully published snapshot from disk and reports the failure

### Requirement: Gateway selects the stage like the Aliyun gateway
The gateway SHALL select the stage from the `X-Ca-Stage` request header and SHALL default to `RELEASE` when the header is absent.

#### Scenario: Test stage routes to test upstream
- **WHEN** a request carries `X-Ca-Stage: TEST`
- **THEN** it is routed to the upstream bound to the TEST stage of the matched site

#### Scenario: Missing stage uses release
- **WHEN** a request carries no `X-Ca-Stage`
- **THEN** it is routed to the RELEASE stage

### Requirement: Gateway proxies HTTP, WebSocket and SSE without buffering streams
The gateway SHALL proxy HTTP/1.1 and HTTP/2 requests, WebSocket upgrades and server-sent events, streaming bodies to and from upstreams without buffering whole responses.

#### Scenario: Server-sent events stream through
- **WHEN** an upstream responds with `text/event-stream`
- **THEN** each event reaches the client as it is written, without waiting for the response to end

#### Scenario: WebSocket upgrade
- **WHEN** a client sends a WebSocket upgrade on a route that allows it
- **THEN** the gateway completes the upgrade with the upstream and relays frames in both directions

### Requirement: Gateway always forwards client identity headers
The gateway SHALL resolve the client IP using only configured trusted hops and SHALL set `X-Forwarded-For`, `X-Real-IP`, `X-Forwarded-Proto`, `X-Request-Id` and `traceparent` on every upstream request.

#### Scenario: Forwarded requests cannot reach PocketBase admin routes
- **WHEN** a public request for `/api/collections` or `/_/` passes through the gateway to `kanyue.server`
- **THEN** the upstream sees forwarding headers and responds 404

#### Scenario: Spoofed forwarding header from an untrusted client
- **WHEN** a client sends its own `X-Forwarded-For` and is not a trusted hop
- **THEN** the gateway uses the connecting address as the client IP

### Requirement: Gateway balances load and checks upstream health
The gateway SHALL support weighted round robin, least in-flight and consistent-hash balancing, active and passive health checks, and SHALL retry at most once and only for idempotent requests.

#### Scenario: Unhealthy instance is skipped
- **WHEN** an instance fails its health checks or exceeds the passive failure threshold
- **THEN** it receives no traffic until it recovers

#### Scenario: Non-idempotent request is not retried
- **WHEN** a `POST` to an operation not marked idempotent fails with a connection error
- **THEN** the gateway returns the error without retrying

### Requirement: Admin plane is private and audited
The gateway SHALL bind its admin API and console only to configured private addresses, SHALL require superuser login with TOTP, SHALL store secrets encrypted, and SHALL audit every configuration change.

#### Scenario: Public bind is refused
- **WHEN** the admin listener is configured on a public address without an explicit override
- **THEN** the gateway refuses to start and reports why

#### Scenario: Secrets stay out of logs
- **WHEN** a consumer secret or webhook key is created or changed
- **THEN** the audit entry records the change without the secret value
