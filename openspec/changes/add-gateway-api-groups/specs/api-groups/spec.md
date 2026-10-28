## ADDED Requirements

### Requirement: Operations are exposed as APIs in groups bound to domains
The gateway SHALL organise exposed operations as APIs that belong to exactly one API group, where each API references one discovered operation and each group is bound to one or more domains that belong to no other group.

#### Scenario: Group spans services
- **WHEN** an operator adds operations of `kanyue.server` and `kanyue.pay` to the same group
- **THEN** both become APIs of that group, served on the group's domains once released

#### Scenario: Domain already bound
- **WHEN** an operator binds a domain that another group already uses
- **THEN** the change is rejected

#### Scenario: Operations are selected, never mounted automatically
- **WHEN** a service's manifest adds a new operation
- **THEN** no API is created until an operator selects the operation, and there is no option to add every operation at once

### Requirement: Each domain selects an environment
The gateway SHALL resolve the environment of a request from the domain's fixed environment when set, otherwise from `X-Ca-Stage`, otherwise `RELEASE`, and SHALL support the environments `TEST`, `PRE` and `RELEASE`.

#### Scenario: Header selects the environment
- **WHEN** a request to `mapi.ikanyue.com` carries `X-Ca-Stage: TEST`
- **THEN** it is served by the TEST release of the group's APIs and TEST instances

#### Scenario: Fixed domain ignores the header
- **WHEN** a domain is fixed to `TEST` and a request to it carries `X-Ca-Stage: RELEASE`
- **THEN** it is still served by the TEST environment

### Requirement: APIs declare visibility and authentication
Each API SHALL declare its visibility (public or private) and authentication (backend passthrough, application signature, JWT or none); the authentication brings its plugin without a separate binding, and a private API SHALL require an application signature from an application granted that API or its group in the request's environment.

#### Scenario: Ungranted application calls a private API
- **WHEN** a correctly signed request from an application without a grant calls a private API
- **THEN** the gateway rejects it with 403

#### Scenario: Mini program calls stay unchanged
- **WHEN** the mini program calls a public API with passthrough authentication
- **THEN** the request is forwarded with its `token` header for the backend to verify

### Requirement: Existing configuration migrates without changing traffic
The gateway SHALL migrate sites, routes, plugin bindings and the published snapshot into groups, APIs, policy sets and releases in one transaction after taking a backup, so that every environment serves exactly what it served before.

#### Scenario: Responses match after migration
- **WHEN** the same requests are sent to every environment before and after the migration
- **THEN** routing, policies and responses are the same, and the old collections remain readable
