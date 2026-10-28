## ADDED Requirements

### Requirement: Policies come from reusable policy sets in fixed layers
The gateway SHALL resolve an API's effective policies per environment from at most one source per layer, in this order: the platform baseline, the group's default policy set, the API's policy set, the API's overrides, and application-specific settings; a policy set SHALL not include other policy sets, and a group or an API SHALL not attach more than one.

#### Scenario: API inherits the group's policy set
- **WHEN** a group's default policy set has `cors` and `rate-limit` and the API attaches none
- **THEN** the API's effective policies are the baseline plus those two

#### Scenario: Second policy set refused
- **WHEN** an operator tries to attach a second policy set to a group or an API, or to reference a policy set from inside another
- **THEN** the change is rejected

### Requirement: Lower layers override or stack by policy kind
For override-kind policies (authentication, `cors`, `ip-restriction`, `circuit-breaker`, `fallback`, `request-rewrite`, `body-limit`, `maintenance`, `mock`, `traffic-split`, `mirror`) the lowest layer that configures the policy SHALL win, and an API override MAY disable an unlocked inherited policy; for `rate-limit` every layer's limit SHALL apply with its own counter.

#### Scenario: API relaxes body size
- **WHEN** the group's set limits bodies to 1 MB and an upload API overrides `body-limit` to 20 MB
- **THEN** the upload API accepts 20 MB and the other APIs keep 1 MB

#### Scenario: Group and API limits both apply
- **WHEN** the group's set limits 1000 requests per minute and the API's override adds 100 per minute
- **THEN** the API rejects the 101st request in a minute

### Requirement: Locked policies cannot be overridden below
A policy item marked locked SHALL not be changed or disabled by any lower layer; lower layers MAY only add further `rate-limit` items below a locked one; violations SHALL be rejected when saved.

#### Scenario: Locked IP restriction
- **WHEN** the baseline locks `ip-restriction` and an API override tries to change or disable it
- **THEN** the save is rejected and names the locking layer

### Requirement: Policy changes show their impact and go live only through releases
Before saving a change to a policy set or a lock, the console SHALL list the affected groups and APIs with their effective policy differences per environment; the change SHALL mark those APIs as having unreleased changes and SHALL take effect in an environment only when they are released there.

#### Scenario: Edit a widely used policy set
- **WHEN** an operator edits a policy set used by three groups
- **THEN** the console previews the affected APIs, saving changes no environment, and the operator can release the affected APIs per environment in bulk

#### Scenario: Effective policies are explained
- **WHEN** an operator opens an API
- **THEN** each environment's effective policies are listed with the layer each comes from and whether it is locked
