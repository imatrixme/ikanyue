## MODIFIED Requirements

### Requirement: Role-Aware Mini-Program Navigation
The mini program SHALL present role-specific navigation on three shared tab slots.

#### Scenario: Student opens the mini program
- **WHEN** the active identity is a student
- **THEN** the TabBar displays 首页、约课、我的 and teacher-only routes remain inaccessible

#### Scenario: Teacher opens the mini program
- **WHEN** the active identity is a teacher
- **THEN** the TabBar displays 工作台、日历、我的, the first tab shows the teacher workbench, the second shows the teacher calendar, and student financial or reward data remains inaccessible
