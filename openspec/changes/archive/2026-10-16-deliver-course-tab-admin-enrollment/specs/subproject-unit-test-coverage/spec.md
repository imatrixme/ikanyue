## MODIFIED Requirements

### Requirement: Ninety Percent Coverage Gate
Affected Hono, Admin, and Taro code SHALL provide repeatable coverage commands enforcing at least 95% lines, branches, functions, and statements coverage for project-owned code in the implemented scope.

#### Scenario: Hono coverage threshold is enforced
- **WHEN** the Hono course-delivery coverage command runs
- **THEN** it fails if lines, branches, functions, or statements fall below 95%

#### Scenario: Admin coverage threshold is enforced
- **WHEN** the Admin coverage command runs
- **THEN** it fails if lines, branches, functions, or statements fall below 95%

#### Scenario: Taro coverage threshold is enforced
- **WHEN** the Taro course-experience coverage command runs
- **THEN** it fails if lines, branches, functions, or statements fall below 95%

#### Scenario: Coverage evidence is reported independently
- **WHEN** implementation verification is complete
- **THEN** the exact command and measured lines, branches, functions, and statements percentages are reported for each affected project

