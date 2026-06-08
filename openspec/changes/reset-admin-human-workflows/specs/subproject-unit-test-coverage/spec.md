## ADDED Requirements

### Requirement: Admin Human Workflow UX Tests
The admin project SHALL include focused tests for lifecycle navigation, role work queues, guided motive grouping, business-facing labels, and data-center separation under the existing local test and coverage commands.

#### Scenario: Lifecycle navigation is covered
- **WHEN** admin component or app-flow tests run
- **THEN** they verify that administrator navigation exposes lifecycle groups and keeps low-level relation maintenance under an advanced data-center path

#### Scenario: Teacher navigation is covered
- **WHEN** admin component or app-flow tests run
- **THEN** they verify that non-admin teachers see task-oriented teaching surfaces and do not see administrator data-center maintenance destinations

#### Scenario: Dashboard work queues are covered
- **WHEN** admin dashboard tests run
- **THEN** they verify that administrator and teacher dashboards show role-scoped work queues with human-readable empty states or records

#### Scenario: Guided motive grouping is covered
- **WHEN** guided operations tests run
- **THEN** they verify that first-level workflow choices are grouped by human motive and detailed templates are secondary choices inside those groups

#### Scenario: Business labels are covered
- **WHEN** resource configuration or rendering tests run
- **THEN** they verify that ordinary UI labels translate teaching, lesson, report, and miniapp placement resources into business-facing terms

#### Scenario: Data center boundary is covered
- **WHEN** data maintenance tests run
- **THEN** they verify that advanced tables retain sorting, filtering, selection, and editing affordances while explaining their diagnostic purpose
