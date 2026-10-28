## ADDED Requirements

### Requirement: Policies are schema-described plugins bound at defined levels
The gateway SHALL implement policies as plugins that declare a JSON Schema for their configuration, are compiled at publish time, and bind at global, site, route or consumer level with a deterministic execution order.

#### Scenario: Console renders a form from the schema
- **WHEN** an operator adds a plugin to a route
- **THEN** the console shows a form generated from the plugin schema and rejects values the schema does not allow

#### Scenario: Route binding overrides global binding
- **WHEN** the same plugin is bound globally and on a route
- **THEN** the route configuration applies to that route

### Requirement: Gateway authenticates requests compatibly with existing clients
The gateway SHALL support no authentication, JWT validated with the same secret and rules as `kanyue.server`, and Aliyun-compatible AppKey signatures using `X-Ca-Key` and `X-Ca-Signature`, with replay protection on signed requests.

#### Scenario: Unsigned mini program traffic keeps working
- **WHEN** the mini program sends its current headers (`X-Ca-Stage`, `X-Ca-Nonce`, `X-Ca-Source`, `token`) to a no-auth route
- **THEN** the request is forwarded unchanged

#### Scenario: Valid Aliyun signature
- **WHEN** a request is signed with a registered consumer's AppKey and secret using the Aliyun signing rules
- **THEN** the request is forwarded with the consumer identity attached

#### Scenario: Replayed signed request
- **WHEN** a signed request reuses an `X-Ca-Nonce` within the replay window or its `X-Ca-Timestamp` is outside the window
- **THEN** the gateway rejects it with an `X-Ca-Error-Message` header

#### Scenario: Invalid JWT
- **WHEN** a route requires JWT and the token is missing, expired or signed with another key
- **THEN** the gateway responds 401 without calling the upstream

### Requirement: Gateway enforces access control and rate limits
The gateway SHALL support IP allow and deny lists, CORS, request body limits, and rate limits keyed by API, consumer or user over second, minute or day windows.

#### Scenario: Rate limit exceeded
- **WHEN** a key exceeds its configured quota in the current window
- **THEN** the gateway responds 429 and the request does not reach the upstream

#### Scenario: Denied IP
- **WHEN** a client IP matches a deny rule on the route
- **THEN** the gateway responds 403

### Requirement: Gateway degrades and splits traffic
The gateway SHALL provide circuit breaking with fallback responses, maintenance mode, mock responses, request rewriting, traffic splitting by weight, header, cookie or user hash, and traffic mirroring.

#### Scenario: Breaker opens
- **WHEN** a route's upstream error ratio exceeds its threshold for the configured window
- **THEN** the gateway serves the configured fallback response until a probe succeeds

#### Scenario: Sticky canary by user
- **WHEN** a route splits 10% of users to a canary upstream by user hash
- **THEN** the same user consistently reaches the same upstream

#### Scenario: Mirrored request does not affect the client
- **WHEN** a route mirrors traffic to another upstream
- **THEN** the client response comes only from the primary upstream and mirror latency or errors are not visible to it
