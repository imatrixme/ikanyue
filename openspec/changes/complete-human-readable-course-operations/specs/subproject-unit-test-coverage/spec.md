## ADDED Requirements

### Requirement: Human-Readable Course Presentation Coverage
The Admin and Taro subprojects SHALL include repeatable tests for course-operation presentation rules and semantic relationship workflows.

#### Scenario: Admin presentation mappings are tested
- **WHEN** Admin unit tests run
- **THEN** they verify known and unknown status labels, person and object identity fallbacks, money and date summaries, and suppression of serialized JSON in normal views

#### Scenario: Admin relationship workflows are tested
- **WHEN** Admin interaction tests run
- **THEN** they verify teacher, class, package, course, credit-type, lesson, and price choices are selected through human-readable controls while submitted payloads retain the correct identifiers

#### Scenario: Admin selected identity remains human-readable
- **WHEN** Admin roster, attendance, settlement, enrollment, account, or workload tests render selected records
- **THEN** they assert recognizable names and business context remain visible and raw identifiers are not the primary label

#### Scenario: Taro learner terminology is tested
- **WHEN** Taro unit tests run
- **THEN** they verify learner-facing balance, reservation, history, conversion, return, correction, and expiry labels without requiring WeChat DevTools

#### Scenario: Existing coverage gates remain enforced
- **WHEN** the affected subproject coverage commands run
- **THEN** this presentation and interaction logic is included without reducing the established coverage thresholds
