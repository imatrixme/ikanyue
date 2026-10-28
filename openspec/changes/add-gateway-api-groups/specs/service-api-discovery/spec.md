## MODIFIED Requirements

### Requirement: Operators select discovered operations instead of typing them
The gateway SHALL build APIs from discovered services and operations, and SHALL NOT offer free-text upstream addresses or paths except for audited static entries. Service discovery SHALL register every service and instance, but operation discovery SHALL only offer operations for selection: a group SHALL expose exactly the APIs an operator created from selected operations and released, and SHALL NOT expose an operation because its service registered it.

#### Scenario: New operation appears
- **WHEN** a manifest adds an operation
- **THEN** the operation is listed as pending, is not reachable through the gateway, and becomes an API only by selection and release

#### Scenario: Operation disappears
- **WHEN** a manifest no longer contains an operation used by an API
- **THEN** the API is flagged in the console, an alert is raised, the API is not deleted automatically, and releasing it is refused until it is taken offline or repointed

### Requirement: Gateway applies checked-in exposure plans
The gateway SHALL ship checked-in exposure plans, each naming an API group, its domains and the operations to expose as APIs with optional visibility, authentication and policy set, and SHALL apply a plan as drafts that release nothing. The `mapi` plan SHALL equal the operations the mini program calls, which is what the Aliyun API Gateway exposes today, and checks SHALL fail when the plan, the mini program calls or the served routes drift apart.

#### Scenario: Apply creates drafts
- **WHEN** an operator applies the `mapi` plan
- **THEN** the `mapi.ikanyue.com` group and its APIs match the plan as drafts, the change is audited, and no environment changes until the operator releases

#### Scenario: Listed operation is not served yet
- **WHEN** a listed operation belongs to a feature the service has switched off
- **THEN** the apply reports it as not served, creates the rest, and applying again after the feature is on adds it

#### Scenario: Plan drifts from the mini program
- **WHEN** the mini program calls an operation the plan does not list, or the plan lists one the mini program no longer calls or the service does not route
- **THEN** the repository checks fail
