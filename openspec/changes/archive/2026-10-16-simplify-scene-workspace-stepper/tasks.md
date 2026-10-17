## 1. OpenSpec Contract

- [x] 1.1 Reframe the change from forced scene steppers to reduced-friction role workflows.
- [x] 1.2 Update proposal, design, and delta specs so they match the current product decision.

## 2. Role-Specific Entry

- [x] 2.1 Narrow non-admin teacher access to teaching surfaces instead of admin maintenance surfaces.
- [x] 2.2 Replace the generic dashboard with role-specific teacher and administrator dashboards.
- [x] 2.3 Load dashboard supporting data for lessons, students, signups, reports, and relation gap checks.
- [x] 2.4 Update shell copy so teachers see a teacher workspace rather than generic backend management.

## 3. Scene Workspace Friction

- [x] 3.1 Make project workspace default to a readable locked scene when a project exists.
- [x] 3.2 Make lesson workspace default to a readable locked scene when a lesson exists.
- [x] 3.3 Keep searchable setup modals for explicit project or lesson context changes.
- [x] 3.4 Keep empty states for missing project or lesson data without exposing relation actions.

## 4. Focused Relation Actions

- [x] 4.1 Convert project student, project teacher, lesson attendance, and lesson teacher actions into single-screen right-side sheets.
- [x] 4.2 Keep locked context visible and remove redundant context-confirmation steps.
- [x] 4.3 Keep searchable people rows, selected avatar summaries, mode selection, and compact save summary visible together.
- [x] 4.4 Preserve existing relation payload behavior and parent identifiers.

## 5. TanStack Data Maintenance

- [x] 5.1 Add TanStack Table only to the admin subproject.
- [x] 5.2 Upgrade shared data tables with sorting, page-local filtering, row selection, selected counts, and density switching.
- [x] 5.3 Label generic tables as data maintenance so scene workspaces remain the primary path for daily work.

## 6. Tests And Verification

- [x] 6.1 Update permissions tests for teacher access boundaries.
- [x] 6.2 Update dashboard tests for role-specific entry points.
- [x] 6.3 Update scene workspace tests for direct entry, context recovery, and single-screen relation actions.
- [x] 6.4 Update app flow tests for the new role and scene behavior.
- [x] 6.5 Run admin lint, typecheck, tests, coverage, build, and strict OpenSpec validation.
- [x] 6.6 Rebuild and restart local Docker admin for HTTP verification.
