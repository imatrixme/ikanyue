## ADDED Requirements

### Requirement: Environment-held signing secret
The business API SHALL sign and verify tokens only with a secret supplied through `JWT_SECRET` of at least 32 characters, and SHALL refuse to issue or accept tokens in production when it is absent.

#### Scenario: Production without secret
- **WHEN** the API runs with `NODE_ENV=production` and no valid `JWT_SECRET`
- **THEN** token signing and verification fail instead of using a built-in key

#### Scenario: Token signed with an old key
- **WHEN** a request presents a token signed by any other key
- **THEN** it is rejected as unauthorized

### Requirement: Expiring tokens
Every issued token SHALL carry a standard `exp`: 30 days for app sessions, 12 hours for Admin sessions and 5 minutes for WeChat role challenges.

#### Scenario: Expired Admin token
- **WHEN** an Admin request presents a token past its `exp`
- **THEN** the API rejects it and the Admin client returns to the login screen

#### Scenario: Cached expired Admin session
- **WHEN** Admin loads with a cached session whose token has expired
- **THEN** the cached session is discarded before any API call

### Requirement: Admin-scoped tokens
Admin endpoints SHALL accept only tokens issued by Admin login, identified by the `scope: ops` claim; app tokens and WeChat role challenges SHALL NOT authorize Admin or app requests outside their purpose.

#### Scenario: Miniapp teacher token used against Admin
- **WHEN** a 30-day miniapp teacher token is sent to an Admin endpoint
- **THEN** the API rejects it and asks for Admin login

#### Scenario: Role challenge used as a session
- **WHEN** a WeChat role challenge token is sent to an authenticated app endpoint
- **THEN** the API rejects it

### Requirement: Safe Admin credential lookup
Admin login SHALL escape the submitted account before building storage filters and SHALL NOT accept plaintext password equality.

#### Scenario: Filter injection attempt
- **WHEN** the account contains quotes or filter operators
- **THEN** it is matched only as a literal account value
