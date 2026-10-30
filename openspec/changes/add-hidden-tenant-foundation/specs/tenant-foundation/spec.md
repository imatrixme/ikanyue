## ADDED Requirements

### Requirement: Tenant Records

The system SHALL keep tenants as records with a name, a kind of `studio`, `individual` or `coach`, an optional parent tenant, a status and the join methods the owner allows. Join methods SHALL be a multi-select of `scan_join` (scan to become a member), `scan_approval` (scan, then staff approve) and `staff_invite` (staff add the student). The parent link and the join methods SHALL carry no behaviour in this phase. A migration SHALL create the 看乐 tenant as the default tenant with `staff_invite`.

#### Scenario: Default tenant after migration
- **WHEN** the tenant migration runs on existing data
- **THEN** exactly one active tenant named 看乐艺术 exists and is the default tenant

#### Scenario: Owner picks several join methods
- **WHEN** a tenant is stored with `scan_join` and `staff_invite`
- **THEN** both methods are kept and no other behaviour changes in this phase

#### Scenario: Parent left empty
- **WHEN** a tenant is created without a parent
- **THEN** it is stored with an empty parent and behaves like any other tenant

### Requirement: Tenant Ownership Of Business Data

Every business record SHALL belong to exactly one tenant. The migration SHALL assign all existing business records to the default tenant. The server SHALL set the tenant of new records from the request or job tenant and SHALL ignore any tenant supplied by a client.

#### Scenario: Backfill
- **WHEN** the migration finishes
- **THEN** every existing record in every business collection belongs to the default tenant

#### Scenario: Client-supplied tenant ignored
- **WHEN** a client creates a record and sends another tenant id in the body
- **THEN** the record is stored under the request tenant

### Requirement: Tenant-Scoped Data Access

All business reads and writes SHALL go through a tenant-scoped app that limits every query to the current tenant. A record of another tenant SHALL be treated as not found. Business code MUST NOT run raw SQL, choose a tenant itself or use the unscoped app outside scheduled-job registration; a static check SHALL enforce this outside an explicit allowlist of migration, seeding, test and platform code.

#### Scenario: List stays in tenant
- **WHEN** two tenants each have students and a request of tenant A lists students
- **THEN** only tenant A's students are returned

#### Scenario: Other tenant's id
- **WHEN** a request of tenant A asks for a record id that belongs to tenant B
- **THEN** the server answers as if the record did not exist

#### Scenario: Unscoped access added
- **WHEN** a business package adds raw SQL, its own tenant choice or a handler on the unscoped app outside the allowlist
- **THEN** the static check fails

### Requirement: Tenant-Scoped Uniqueness

Business codes and person identifiers SHALL be unique within a tenant, not across tenants. Idempotency keys, order and operation numbers, provider event ids and authentication fields SHALL stay globally unique.

#### Scenario: Same cellphone in two tenants
- **WHEN** tenant A and tenant B each register a student with the same cellphone
- **THEN** both records are accepted

#### Scenario: Duplicate inside one tenant
- **WHEN** tenant A registers a second student with a cellphone it already has
- **THEN** the second record is rejected

### Requirement: Tenant Plugins

The system SHALL record which plugins each tenant has enabled. Payment SHALL be the first plugin, covering package checkout, price versions, orders, refunds, reconciliation and the payment gateway link. A plugin's routes SHALL answer as not found unless the deployment provides the plugin and the request tenant has it enabled. Core features SHALL work fully for a tenant without any plugin, and core code MUST NOT depend on plugin code. The migration SHALL enable the payment plugin for the default tenant.

#### Scenario: Tenant without payment
- **WHEN** a tenant without the payment plugin calls the package checkout route
- **THEN** the server answers as if the route did not exist, and booking and lesson redemption keep working for that tenant

#### Scenario: Default tenant keeps payment
- **WHEN** the migration has run on a deployment with commerce enabled
- **THEN** the default tenant can check out packages exactly as before

#### Scenario: Deployment switch off
- **WHEN** the deployment disables commerce
- **THEN** payment routes are unavailable for every tenant, whatever its plugin records say

### Requirement: Hidden Single Tenant

In this phase every request and every scheduled job SHALL resolve to the default tenant through a single resolver, and the public API, gateway exposure, mini program and Admin behaviour SHALL stay unchanged. Scheduled jobs SHALL run once per active tenant with that tenant's scope.

#### Scenario: Existing contracts
- **WHEN** the existing contract tests and mini program live flows run after the migration
- **THEN** they pass without changes

#### Scenario: Scheduled job per tenant
- **WHEN** the daily renewal scan runs with two active tenants
- **THEN** each tenant's reminders are created only from that tenant's courses
