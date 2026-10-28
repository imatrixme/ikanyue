## ADDED Requirements

### Requirement: Changes are drafts until released to an environment
The gateway SHALL keep every edit to groups, APIs, policy sets and grants as a draft that changes no environment, and SHALL apply it only when an operator releases selected APIs or group settings to one environment.

#### Scenario: Registering does not go live
- **WHEN** an operator creates or edits an API, or applies an exposure plan
- **THEN** every environment keeps serving its previous configuration and the API shows unreleased changes per environment

#### Scenario: Release to TEST only
- **WHEN** an operator releases an API to `TEST`
- **THEN** `TEST` serves the new definition while `PRE` and `RELEASE` keep the old one

#### Scenario: Release one API of a group
- **WHEN** a group has edits on two APIs and the operator releases one of them
- **THEN** only that API changes in the target environment

### Requirement: Releases are versioned per API and environment
Each release SHALL store the resolved definition of every target, including its effective policies, with a version per API or group setting and environment; offline and rollback SHALL be releases themselves.

#### Scenario: Roll back one API
- **WHEN** an operator rolls an API in `RELEASE` back to an earlier version
- **THEN** that exact definition is served again, recorded as a new release, and other APIs are untouched

#### Scenario: Take an API offline
- **WHEN** an operator takes an API offline in `RELEASE`
- **THEN** requests to it in `RELEASE` answer 404 and the other environments are untouched

### Requirement: Releases are prechecked and promotion differences are confirmed
A release SHALL be refused when the target environment has no healthy instance of a target's service, when paths of the same priority conflict on a domain, when a policy configuration fails its schema, when the source operation was removed, or when a private API lacks application signatures; a release to `RELEASE` whose definition differs from the one in `PRE` SHALL show the difference and require a reason. The health check alone may be skipped with force and a reason.

#### Scenario: RELEASE differs from PRE
- **WHEN** an operator releases to `RELEASE` an API whose definition differs from its `PRE` release
- **THEN** the console shows the difference and the release needs a reason, which is recorded

#### Scenario: Conflicting paths
- **WHEN** two APIs of the same priority would serve overlapping paths on one domain
- **THEN** the release is refused and names both APIs

### Requirement: Each environment is served from its own snapshot
The data plane SHALL hold one compiled, immutable snapshot per environment, built only from released definitions, and a release SHALL rebuild and atomically swap only the target environment and persist it as that environment's last known good file.

#### Scenario: Failed compile
- **WHEN** compiling an environment's snapshot fails during a release
- **THEN** nothing is recorded as released and that environment keeps serving its previous snapshot

### Requirement: Every change is audited with its difference
The gateway SHALL append an audit entry for every write, holding the actor, time, before, after and field-level difference with secrets reduced to fingerprints, and for every release, offline, rollback, exposure apply and migration, holding the environment, targets, versions, force and reason; audit entries SHALL not be editable or deletable.

#### Scenario: Trace an API's history
- **WHEN** an operator opens an API's history
- **THEN** every edit and release of it is listed with who did it, when, and what changed
