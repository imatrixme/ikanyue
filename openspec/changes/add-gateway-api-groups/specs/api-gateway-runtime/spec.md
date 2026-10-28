## MODIFIED Requirements

### Requirement: Gateway serves traffic from an immutable versioned snapshot
The gateway data plane SHALL route requests using only in-memory, immutable snapshots, one per environment, compiled from released definitions, and SHALL NOT read the configuration database while serving a request.

#### Scenario: Release swaps one environment atomically
- **WHEN** an operator releases APIs to an environment
- **THEN** the control plane validates and compiles that environment, the data plane switches that environment to the new snapshot atomically, in-flight requests finish on the snapshot they started with, and other environments are untouched

#### Scenario: Invalid configuration is rejected
- **WHEN** a release contains a path conflict, an invalid plugin configuration, or a reference to a missing service or operation
- **THEN** the release fails with the reasons and the running snapshot is unchanged

#### Scenario: Rollback restores a previous version
- **WHEN** an operator rolls an API or group setting back to an earlier version in an environment
- **THEN** that version serves again in that environment and the rollback is recorded as a release and in the audit log

#### Scenario: Start with last known good snapshot
- **WHEN** the gateway starts and the control plane cannot load or compile an environment
- **THEN** the data plane serves that environment's last successfully released snapshot from disk and reports the failure
