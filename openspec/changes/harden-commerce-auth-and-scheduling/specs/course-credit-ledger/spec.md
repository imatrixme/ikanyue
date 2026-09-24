## ADDED Requirements

### Requirement: Adequate transactional batch capacity
Business storage SHALL allow at least 500 requests per atomic batch, verified at startup, and the repository SHALL reject larger plans with a readable message instead of a storage error.

#### Scenario: Large class publication
- **WHEN** a session with 20 students and a 2-hour duration is published
- **THEN** it commits in one atomic batch

#### Scenario: Oversize plan
- **WHEN** a plan exceeds 500 requests
- **THEN** the operation fails with `BATCH_PLAN_TOO_LARGE` before contacting storage

### Requirement: Versioned commerce schema
Commerce collections SHALL be created by a versioned PocketBase migration generated from the commerce schema.

#### Scenario: Production rollout
- **WHEN** migrations are applied to a fresh business database
- **THEN** all commerce collections exist with superuser-only rules
