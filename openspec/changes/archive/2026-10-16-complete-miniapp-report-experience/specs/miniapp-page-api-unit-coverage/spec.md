## ADDED Requirements

### Requirement: Report Workflow Coverage
The mini program report workflow SHALL have focused unit and API tests covering share-token viewing, student-owned report viewing, report history, and operation-slot navigation.

#### Scenario: Mini program report logic is tested
- **WHEN** mini program report page logic maps privacy-safe report payloads
- **THEN** unit tests cover summary, section details, comments, recommendations, empty states, invalid tokens, and student-owned report navigation

#### Scenario: Operation slot resilience is tested
- **WHEN** home page logic combines activities, operation slots, static navigation, and error states
- **THEN** unit tests cover activity failure, operation-slot failure, unsupported targets, and successful navigation target generation

#### Scenario: Hono student report APIs are tested
- **WHEN** student-facing report APIs are implemented
- **THEN** Hono tests cover listing own reports, opening own reports, rejecting other students' reports, rejecting anonymous access, and returning privacy-safe payloads

#### Scenario: Coverage evidence includes runtime-sensitive paths
- **WHEN** verification is complete
- **THEN** the final evidence includes Taro unit coverage, Taro WeChat build, Hono tests/coverage, and the repeatable mini program runtime verification command or documented simulator/manual script
