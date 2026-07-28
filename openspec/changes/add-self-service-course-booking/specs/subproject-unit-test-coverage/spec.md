## RENAMED Requirements

- FROM: `### Requirement: Ninety Percent Coverage Gate`
- TO: `### Requirement: Ninety Five Percent Coverage Gate`

## MODIFIED Requirements

### Requirement: Ninety Five Percent Coverage Gate
Affected Taro, Hono, and Admin code SHALL provide repeatable coverage commands enforcing at least 95% line, branch, function, and statement coverage independently in each project.

#### Scenario: Hono coverage threshold is enforced
- **WHEN** `npm run test:coverage` is run from `ikanyue.mapi.hono`
- **THEN** the command fails if covered Hono source lines, branches, functions, or statements fall below 95%

#### Scenario: Admin coverage threshold is enforced
- **WHEN** `npm run test:coverage` is run from `ikanyue.admin`
- **THEN** the command fails if covered Admin source lines, branches, functions, or statements fall below 95%

#### Scenario: Taro coverage threshold is enforced
- **WHEN** `npm run test:coverage` is run from `ikanyue.taro3`
- **THEN** the command fails if covered mini-program source lines, branches, functions, or statements fall below 95%

### Requirement: Booking Concurrency and Transaction Coverage
The Hono project SHALL test the appointment transaction kernel, time-claim uniqueness, rollback, cancellation, rescheduling, expiry, and idempotency at both pure-planning and repository-contract levels.

#### Scenario: Competing confirmations are tested
- **WHEN** two confirmation plans target an overlapping teacher or student time cell
- **THEN** tests prove that no valid outcome can commit duplicate active claims and that a failed command leaves no partial session or lesson-hour movement

### Requirement: Booking UI Workflow Coverage
The Taro and Admin projects SHALL cover scene-level booking interactions rather than only rendering individual fields.

#### Scenario: Human booking workflows are tested
- **WHEN** frontend tests run
- **THEN** they cover the decisions and outcomes required to request, confirm, decline, cancel, reschedule, configure availability, resolve conflicts, and navigate into the linked lesson
