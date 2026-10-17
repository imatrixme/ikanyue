## ADDED Requirements

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
