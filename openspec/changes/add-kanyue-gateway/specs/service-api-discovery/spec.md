## ADDED Requirements

### Requirement: Services publish a generated API manifest
`kanyue.server` and `kanyue.pay` SHALL register routes through a registry that records method, path, module, auth scope, idempotency and summary, and SHALL serve the result as OpenAPI 3.1 at `/internal/gateway/manifest` to internal callers only.

#### Scenario: Manifest is complete
- **WHEN** the guard test enumerates the routes actually registered on the router
- **THEN** every route appears in the manifest and the manifest lists no route that is not registered

#### Scenario: Public request for the manifest
- **WHEN** a request with forwarding headers asks for `/internal/gateway/manifest`
- **THEN** the service responds 404

### Requirement: Gateway discovers service instances
The gateway SHALL learn service instances from self-registration with heartbeats, from DNS resolution, and from explicitly confirmed static entries, and SHALL expire self-registered instances whose heartbeats stop.

#### Scenario: Self-registration
- **WHEN** a service starts and registers with its service token, address and manifest hash
- **THEN** the instance appears in the console and becomes selectable for routes

#### Scenario: Heartbeat stops
- **WHEN** an instance misses heartbeats beyond the expiry
- **THEN** it is removed from load balancing and marked offline

### Requirement: Operators select discovered operations instead of typing them
The gateway SHALL build routes from discovered services and operations, and SHALL NOT offer free-text upstream addresses or paths except for audited static entries. Service discovery SHALL register every service and instance, but operation discovery SHALL only offer operations for selection: a route SHALL expose exactly the operations an operator selected, and SHALL NOT expose an operation because its service registered it.

#### Scenario: New operation appears
- **WHEN** a manifest adds an operation
- **THEN** the operation is listed as pending, is not reachable through the gateway, and can be attached to a route only by selection

#### Scenario: Route without a selection
- **WHEN** an operator publishes a route that selects no operations
- **THEN** the publish is rejected and the running version is unchanged

#### Scenario: Operation disappears
- **WHEN** a manifest no longer contains an operation used by a route
- **THEN** the route is flagged in the console and an alert is raised, and the route is not deleted automatically

### Requirement: Gateway imports Aliyun API definitions
The gateway SHALL import Swagger exported from Aliyun API Gateway, including its `x-aliyun-apigateway-*` extensions, into draft services, operations and routes for review before publish.

#### Scenario: Import creates drafts
- **WHEN** an operator imports an Aliyun export
- **THEN** draft routes are created with their stages, backends and policies, and nothing is published until the operator publishes
