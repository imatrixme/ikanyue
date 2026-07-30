## MODIFIED Requirements

### Requirement: Ninety Percent Coverage Gate
Affected Hono, Admin, and Taro calendar code SHALL provide repeatable coverage commands enforcing at least 95% line, branch, function, and statement coverage independently in each affected project.

#### Scenario: Hono coverage threshold is enforced
- **WHEN** the course calendar Hono coverage command runs from `ikanyue.mapi.hono`
- **THEN** it fails if covered calendar source lines, branches, functions, or statements fall below 95%

#### Scenario: Admin coverage threshold is enforced
- **WHEN** the Admin coverage command runs from `ikanyue.admin`
- **THEN** it fails if covered calendar React, API-client, state, helper, or workflow lines, branches, functions, or statements fall below 95%

#### Scenario: Taro coverage threshold is enforced
- **WHEN** the Taro coverage command runs from `ikanyue.taro3`
- **THEN** it fails if covered calendar page logic, role logic, API adapter, or shared component logic lines, branches, functions, or statements fall below 95%
