## ADDED Requirements

### Requirement: Admin Role And Scene Workflow Tests
The admin project SHALL include focused tests for role-specific dashboards, direct scene entry, context recovery, focused relation actions, and TanStack-backed data maintenance tables.

#### Scenario: Role dashboard behavior is covered
- **WHEN** admin component and app flow tests run
- **THEN** they verify that administrators see an operations cockpit and teachers see a task-oriented teaching dashboard

#### Scenario: Teacher access boundary is covered
- **WHEN** app permission and app flow tests run
- **THEN** they verify that non-admin teachers cannot access administrator maintenance views such as teachers, templates, report events, audit logs, system settings, guided operations, and raw relation tables

#### Scenario: Direct scene entry is covered
- **WHEN** project and lesson scene workspace tests run with available data
- **THEN** they verify that the locked workspace appears without an initial setup modal

#### Scenario: Context recovery is covered
- **WHEN** scene workspace tests run
- **THEN** they verify that the operator can open the setup modal from a change-context action and confirm another project or lesson without submitting relation changes

#### Scenario: Focused relation actions are covered
- **WHEN** scene action tests run
- **THEN** they verify that single-screen right-side action sheets preserve locked context, selected people, action state, and relation payloads

#### Scenario: Data maintenance table behavior is covered
- **WHEN** shared UI tests run
- **THEN** they verify that the TanStack-backed data table renders rows, empty states, filtering, sorting affordances, row selection, and image/status cells
