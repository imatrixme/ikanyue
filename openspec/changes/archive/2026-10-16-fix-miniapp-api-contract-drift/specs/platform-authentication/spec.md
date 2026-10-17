## ADDED Requirements

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
