## Purpose

Provide a repeatable full local development environment without rebuilding containers, while preserving independent persistent data and release safeguards.

## ADDED Requirements

### Requirement: Native local startup
The default local test command SHALL run application watchers and independent business/payment data services as native processes without requiring Docker.

#### Scenario: Docker unavailable
- **WHEN** a developer starts a prepared local environment with Docker stopped
- **THEN** all configured local services can start and report readiness

### Requirement: Explicit safe initialization
Ordinary startup SHALL NOT silently seed, reset credentials, migrate or overwrite existing data; initialization SHALL be an explicit operation.

#### Scenario: Existing Docker volume
- **WHEN** native development is first configured
- **THEN** existing Docker volumes remain untouched and any data import requires an explicit consistent backup/restore step

### Requirement: Owned process lifecycle
The launcher SHALL report logs/status and restart or stop only processes whose identity and ownership it can validate.

#### Scenario: Occupied port
- **WHEN** an unrelated process occupies a requested port
- **THEN** startup reports the conflict without terminating that process

### Requirement: Release-only container packaging
Container image construction SHALL be explicit in release preparation, with separate payment persistence and production mock rejection.

#### Scenario: Routine restart
- **WHEN** a developer restarts a local service
- **THEN** no container image is built and no database initialization runs
