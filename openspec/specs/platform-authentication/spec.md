# platform-authentication Specification

## Purpose
TBD - created by archiving change harden-commerce-auth-and-scheduling. Update Purpose after archive.
## Requirements
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

### Requirement: Redacted user payloads
Every API response that returns a user, student or teacher record SHALL omit password material, `tokenKey`, WeChat identifiers and the last login IP.

#### Scenario: Password login succeeds
- **WHEN** a user logs in with a correct cellphone and password
- **THEN** the response contains the token and public profile fields but no `password`, `tokenKey` or `wechatId`

#### Scenario: Profile update
- **WHEN** a user updates their profile
- **THEN** the returned record is redacted the same way

### Requirement: Password login does not create accounts
Password login SHALL reject unknown cellphone numbers with 401 and SHALL NOT create a student record.

#### Scenario: Unknown number
- **WHEN** a password login uses a number with no account
- **THEN** the API answers 401 and no account is created

### Requirement: Bounded password attempts
Password login SHALL escape the cellphone before building storage filters and SHALL refuse further attempts for an account after 5 failures within 15 minutes.

#### Scenario: Repeated wrong passwords
- **WHEN** the same cellphone fails 5 times within 15 minutes
- **THEN** the next attempt answers 429 without checking the password

#### Scenario: Filter operators in cellphone
- **WHEN** the cellphone contains quotes or filter operators
- **THEN** they are matched literally

### Requirement: Distinguishable invalid session
Responses rejected because the token is missing, invalid, expired or only an identity-selection challenge SHALL carry `errorCode: "AUTH_SESSION_INVALID"`, and the miniapp SHALL clear its local session when it receives that code.

#### Scenario: Expired token on a protected tab
- **WHEN** the miniapp calls a protected API with an expired token
- **THEN** the API answers code 403 with `errorCode` `AUTH_SESSION_INVALID`
- **AND** the miniapp removes the cached session so the page shows its signed-out state on reload

#### Scenario: Forbidden but signed in
- **WHEN** a signed-in user calls an API their role may not use
- **THEN** the response does not carry `AUTH_SESSION_INVALID` and the session is kept

### Requirement: No secrets in client logs
The miniapp SHALL NOT log tokens, cached user records or API response bodies.

#### Scenario: Production bundle
- **WHEN** the weapp production bundle is built
- **THEN** it contains no log statement that prints the token, the user cache or a response body

