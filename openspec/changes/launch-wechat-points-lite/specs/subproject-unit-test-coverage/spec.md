## MODIFIED Requirements

### Requirement: Ninety Percent Coverage Gate
Affected Hono, Taro, and admin code SHALL provide repeatable coverage commands enforcing at least 95% line, branch, and function coverage for this release.

#### Scenario: Hono coverage threshold is enforced
- **WHEN** the Hono coverage command is run from `ikanyue.mapi.hono`
- **THEN** the command fails if covered Hono source lines, branches, or functions fall below 95%

#### Scenario: Admin coverage threshold is enforced
- **WHEN** the admin coverage command is run from `ikanyue.admin`
- **THEN** the command fails if covered admin source lines, branches, or functions fall below 95%

#### Scenario: Taro coverage threshold is enforced
- **WHEN** the Taro coverage command is run from `ikanyue.taro3`
- **THEN** the command fails if covered Taro source lines, branches, or functions fall below 95%

### Requirement: Coverage Scope Is Reported
Coverage evidence SHALL state the concrete commands and measured coverage for every affected project.

#### Scenario: Coverage results are auditable
- **WHEN** implementation is complete
- **THEN** the final verification output includes the commands run and the measured Hono, Taro, and admin coverage percentages

## ADDED Requirements

### Requirement: Lite Points E2E Coverage
The release SHALL include end-to-end tests covering the critical lite points workflow without requiring Docker during normal iteration.

#### Scenario: Admin offline redemption flow is covered
- **WHEN** E2E tests run for the lite admin app
- **THEN** they cover login, student lookup, adding points, reward item management, and offline redemption deduction

#### Scenario: Student reward availability flow is covered
- **WHEN** E2E tests run for the mini program-facing reward flow
- **THEN** they cover current point display, redeemable reward display, and locked reward display

#### Scenario: Docker is reserved for release verification
- **WHEN** normal development verification is run before release approval
- **THEN** the required local gates do not require Docker compose
