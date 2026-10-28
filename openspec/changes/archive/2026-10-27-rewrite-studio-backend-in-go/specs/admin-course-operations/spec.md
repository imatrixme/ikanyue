## MODIFIED Requirements

### Requirement: Course Catalog Management
Authorized finance or admin operators SHALL create, edit, activate, and deactivate course specifications, packages, grant lines, and price versions through explicit `kanyue.server` commands.

#### Scenario: Operator publishes a package
- **WHEN** all course-hour grant lines, price, activation, and validity fields pass validation
- **THEN** the package becomes available to the Admin enrollment workflow without direct PocketBase browser access

### Requirement: Capability-Scoped Navigation
Admin SHALL derive visible sections, section tabs and allowed actions from server-provided capabilities and SHALL still rely on `kanyue.server` for authoritative authorization. A section SHALL be visible only when at least one of its tabs is accessible, and selecting it SHALL open its first accessible tab.

#### Scenario: Teacher opens Admin
- **WHEN** a teacher has only assigned-teaching capabilities
- **THEN** Admin shows assigned students and lessons but hides prices, account adjustments, global audit, points, and rewards management

#### Scenario: Teacher sees a personal schedule section
- **WHEN** a teacher-only account opens the 课表 section
- **THEN** the section is labelled "我的课表" and only tabs allowed by its capabilities are shown
