## ADDED Requirements

### Requirement: Logs are queried and exported through replaceable interfaces
The gateway SHALL read console log views only through a `LogStore` interface backed by local SQLite, and SHALL send logs and events to external systems only through an `Exporter` interface. The first phase SHALL provide one exporter that posts JSON lines over HTTP, compatible with VictoriaLogs `/insert/jsonline`.

#### Scenario: Export to same-host VictoriaLogs
- **WHEN** an operator configures the JSON lines exporter with `http://127.0.0.1:9428/insert/jsonline`, field mapping and sampling, and runs the connection test
- **THEN** a marked test record is ingested and the exporter can be enabled

#### Scenario: Connection test fails
- **WHEN** the endpoint is unreachable or rejects the credentials
- **THEN** the console shows the error and the exporter stays disabled

### Requirement: Exports never block traffic
The exporter SHALL use a bounded in-memory queue with batching and exponential backoff, SHALL drop and count records when the queue is full, and SHALL raise an alert when exporting keeps failing.

#### Scenario: VictoriaLogs is stopped
- **WHEN** the export endpoint is down
- **THEN** requests are served with unchanged latency, the dropped count increases, the "export failing" alert fires, and the same requests remain queryable from local logs

### Requirement: Logs are redacted by default
Local logs and exports SHALL exclude `token`, `Authorization`, cookies, request and response bodies and personal data by default, and SHALL allow client IP truncation.

#### Scenario: Default log record
- **WHEN** a request carrying a `token` header and a phone number in its body is logged and exported
- **THEN** neither the token nor the body appears in the local record or the exported record

### Requirement: Services back up their own data to object storage
`kanyue.gateway`, `kanyue.server` and `kanyue.pay` SHALL use PocketBase scheduled backups to S3-compatible storage with settings encrypted via `--encryptionEnv`, and SHALL report their last backup result to the gateway, which SHALL show backup status and alert when a backup is overdue. The gateway SHALL NOT read or transfer business data.

#### Scenario: Backup is overdue
- **WHEN** a service has not reported a successful backup within its expected interval
- **THEN** the console marks the service and an alert is raised

#### Scenario: Restore the gateway configuration
- **WHEN** the gateway configuration database is lost
- **THEN** an operator can restore the latest backup from object storage and the restored versions can be published

#### Scenario: Gateway does not handle business data
- **WHEN** a `kanyue.server` backup runs
- **THEN** the service uploads it directly to object storage and the gateway receives only the backup status
