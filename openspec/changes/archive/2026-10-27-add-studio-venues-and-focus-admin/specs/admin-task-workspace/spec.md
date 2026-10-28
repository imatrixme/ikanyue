## MODIFIED Requirements

### Requirement: Administrator Student Detail Page
Administrators SHALL open each student on a dedicated page that gathers lesson-hour balance, upcoming lessons, enrollments, classes, points and recent operations, with renewal and points actions.

#### Scenario: Administrator renews a student
- **WHEN** an administrator opens `/students/:studentId` and chooses "报课/续课"
- **THEN** Admin opens the enrollment dialog in 收款 → 报课 with that student preselected

#### Scenario: Upcoming lessons on the student page
- **WHEN** the student is on the roster of future lessons
- **THEN** the page lists those lessons by start time with their status, excluding cancelled lessons
