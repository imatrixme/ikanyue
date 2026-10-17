## ADDED Requirements

### Requirement: Multi-Report Mini Program Coverage
The mini program page/API test scope SHALL include student report history and detail behavior for multiple reports that may share the same activity, program, session, or student.

#### Scenario: Report history renders multiple report kinds
- **WHEN** the report history page receives multiple published reports for the same student under one scope
- **THEN** unit tests cover display order, report type labels, title selection, status text, and navigation parameters for each report

#### Scenario: Report detail renders generic envelope
- **WHEN** the report detail page receives a generic report instance projection
- **THEN** unit tests cover summary, score, sections, recommendations, subject, recipient, scope, and empty optional fields without requiring legacy assessment-only fields

### Requirement: Report API Coverage Includes Privacy And Authorization
Hono route tests for report APIs SHALL cover generic report instance listing, detail access, and projection privacy in addition to legacy assessment snapshot access.

#### Scenario: Student sees only own published reports
- **WHEN** Hono tests request the student report list with seeded published, draft, and other-recipient report instances
- **THEN** only published reports addressed to the authenticated student are returned

#### Scenario: Report response hides private fields
- **WHEN** Hono tests request a student-owned report detail or public assessment share payload
- **THEN** assertions verify that private PocketBase fields are absent from nested student, teacher, subject, and recipient objects

### Requirement: Coverage Gate Remains At Least Ninety Percent
Affected Hono, admin, and mini program test suites SHALL maintain measured statement, branch, function, and line coverage at or above 90 percent where coverage tooling is configured.

#### Scenario: Coverage commands pass
- **WHEN** the implementation is complete
- **THEN** affected subproject coverage commands pass locally with thresholds set to at least 90 percent
