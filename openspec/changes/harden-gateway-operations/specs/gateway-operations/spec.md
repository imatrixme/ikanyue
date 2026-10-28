## ADDED Requirements

### Requirement: The gateway upgrades without dropping requests
The gateway SHALL support upgrading its own binary without failing client requests, by running a standby instance on the same data directory while the primary drains and restarts behind a reverse proxy that fails over to the standby.

#### Scenario: Primary restarts behind the standby
- **WHEN** the rollout starts the standby with the new version, waits until it is healthy, and restarts the primary
- **THEN** requests that cannot reach the draining primary are served by the standby, in-flight requests on the primary finish, and no client request fails

#### Scenario: Standby stops after the primary is back
- **WHEN** the restarted primary reports healthy
- **THEN** the rollout stops the standby gracefully and the primary serves all traffic

### Requirement: Instances sharing a data directory converge
Every gateway process serving a data directory SHALL adopt releases and instance changes made by another process within 5 seconds.

#### Scenario: Release made by another process
- **WHEN** one process records a newer released version of an environment
- **THEN** every other process serves that version within 5 seconds

#### Scenario: Instance change seen by another process
- **WHEN** an instance goes online or offline through another process
- **THEN** every other process routes accordingly within 5 seconds

### Requirement: The encryption key can be rotated
The gateway SHALL provide an offline command that re-encrypts every stored secret, released configuration, last-known-good file and its PocketBase settings from the current key to a new key, atomically and after a backup.

#### Scenario: Rotation succeeds
- **WHEN** the operator runs the rotation with the current and new keys while no gateway is serving the data directory
- **THEN** a backup is taken, every encrypted value opens with the new key, every released environment compiles with the new key, and the audit log records the rotation without secret values

#### Scenario: Wrong current key
- **WHEN** any stored secret does not open with the given current key
- **THEN** the rotation stops before writing anything

#### Scenario: Gateway still running
- **WHEN** a gateway process is serving the data directory
- **THEN** the rotation refuses to run

### Requirement: Changes are checked continuously
The repository SHALL run the gateway's formatting, static checks, tests, vulnerability scan, console checks and exposure plan test on every change that touches them.

#### Scenario: A change breaks a check
- **WHEN** a push or pull request changes the gateway, its console, the exposure plan or the mini program calls it is checked against
- **THEN** CI runs the checks and reports the failure

### Requirement: Automation uses scoped machine tokens
The admin plane SHALL accept machine tokens limited to a role and to the environments they may release to, stored only as a hash, revocable one by one, with their last use recorded and every change and refusal audited under the token's name.

#### Scenario: Releaser token outside its environments
- **WHEN** a token allowed to release to TEST and PRE tries to release to RELEASE
- **THEN** the request is refused and audited

#### Scenario: A token tries to mint a token
- **WHEN** a machine token calls the token endpoint
- **THEN** the request is refused; only a signed-in superuser mints tokens

### Requirement: Releases to RELEASE can require a second approval
With release approval switched on, the gateway SHALL hold a release to RELEASE as a request until a different identity approves it, and SHALL release only the definitions the request resolved to.

#### Scenario: Approved by a second identity
- **WHEN** one identity requests a release to RELEASE and another approves it
- **THEN** RELEASE serves the requested definitions and both identities are recorded

#### Scenario: Drafts changed after the request
- **WHEN** a draft named in a pending request changes before approval
- **THEN** the approval is refused, the request becomes stale, and nothing is released

### Requirement: Configuration can be exported and applied as drafts
The gateway SHALL export groups, domains, APIs, policy sets and grants to a file without secret values, and apply such a file as drafts that release nothing, reporting the differences.

#### Scenario: Apply a reviewed file
- **WHEN** an operator applies an exported and edited file
- **THEN** the drafts match the file, the differences are listed and audited, and no environment changes until a release

#### Scenario: Compare two environments
- **WHEN** an operator compares PRE with RELEASE
- **THEN** every group and API they serve differently is listed with its versions and differences
