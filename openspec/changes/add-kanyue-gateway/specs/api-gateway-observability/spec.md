## ADDED Requirements

### Requirement: Gateway records request logs without blocking traffic
The gateway SHALL record request logs asynchronously in batches to a store separate from configuration, SHALL keep all error and slow requests, SHALL sample successful requests, and SHALL drop and count entries rather than block when the queue is full.

#### Scenario: Log store is slow
- **WHEN** the log writer falls behind and the queue is full
- **THEN** requests are still served, new entries are dropped, and the drop counter increases

#### Scenario: Error request is always kept
- **WHEN** a request ends with a 5xx status or exceeds the slow threshold
- **THEN** its log entry is stored regardless of the sampling rate

### Requirement: Gateway aggregates route metrics per minute
The gateway SHALL aggregate request counts, status classes, bytes and P50/P95/P99 latency per route per minute in memory and persist each finished minute.

#### Scenario: Traffic view
- **WHEN** an operator opens a route in the console
- **THEN** the console shows its per-minute traffic, error ratio and latency percentiles for the selected range

### Requirement: Gateway shows a dependency graph
The gateway SHALL build a dependency graph from proxied traffic and from outbound-call reports sent by services, showing request rate, error ratio and P95 latency on each edge.

#### Scenario: Payment dependency appears
- **WHEN** `kanyue.server` reports outbound calls to `kanyue.pay`
- **THEN** the graph shows an edge from `kanyue.server` to `kanyue.pay` with its rate and error ratio

### Requirement: Gateway raises and resolves alerts
The gateway SHALL evaluate alert rules every minute, notify configured webhook channels when a rule fires, and notify again when it resolves.

#### Scenario: Upstream goes down
- **WHEN** every instance of a service is unhealthy for longer than the rule duration
- **THEN** the configured channels receive an alert naming the service and affected routes

#### Scenario: Recovery notice
- **WHEN** a firing rule's condition clears
- **THEN** the channels receive a recovery notice

### Requirement: Telemetry has bounded retention
The gateway SHALL delete request logs and metrics older than their configured retention, defaulting to 7 days for logs and 90 days for metrics.

#### Scenario: Old logs are purged
- **WHEN** the retention job runs
- **THEN** request logs older than the log retention are removed
