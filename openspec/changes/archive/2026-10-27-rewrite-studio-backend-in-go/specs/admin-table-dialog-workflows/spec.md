## MODIFIED Requirements

### Requirement: Existing Service Contracts Remain Stable
The table-dialog restructuring SHALL use the existing points-lite Admin API and data contracts.

#### Scenario: Admin build is inspected
- **WHEN** the restructured workflows are built and exercised
- **THEN** they continue using the existing `/ops/points/*` and `/ops/reward-items*` requests without adding a root dependency, a new server route, or a PocketBase field
