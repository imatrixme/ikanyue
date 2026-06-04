## ADDED Requirements

### Requirement: Guided Admin Coverage
The admin project SHALL cover guided operations workflow logic and UI with focused tests under its existing coverage gate.

#### Scenario: Admin coverage includes guided logic
- **WHEN** `npm run test:coverage` is run from `ikanyue.admin`
- **THEN** coverage includes guided workflow definitions, generated-plan logic, and guided dialog components while enforcing the existing 90% line, branch, function, and statement thresholds

#### Scenario: Verification reports concrete commands
- **WHEN** implementation is complete
- **THEN** verification evidence includes the admin commands used for unit tests, coverage, build, lint, and OpenSpec validation
