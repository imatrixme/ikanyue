## ADDED Requirements

### Requirement: Admin Scene UX Tests
The admin project SHALL include focused tests for the refined scene workflow UX under the existing local test and coverage commands.

#### Scenario: Scene locators are covered
- **WHEN** admin component tests run
- **THEN** they verify that project and lesson workspaces use step-based object location rather than native dropdown selection

#### Scenario: Locked context is covered
- **WHEN** admin component tests run
- **THEN** they verify that selecting a project or lesson locks that context for subsequent relation actions

#### Scenario: Document editor ownership is covered
- **WHEN** admin component tests run
- **THEN** they verify that long-form fields open a single document editor sheet and return saved content to the originating form or guided workflow

#### Scenario: Navigation hierarchy is covered
- **WHEN** admin component tests run
- **THEN** they verify that ordinary operators see scene workspaces before advanced relation maintenance paths
