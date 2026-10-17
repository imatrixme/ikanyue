## Why

The previous scene workspace iteration solved dropdown scale but made ordinary work feel over-structured. A teacher or teaching administrator often enters a project or lesson workspace to understand the current state, record attendance, assign a teacher, or write feedback. For these common actions, forcing a motive step, target step, and review step before any context is visible adds training cost instead of reducing it.

The admin should distinguish daily work from complex creation:

- Daily project and lesson work should open directly into a readable locked scene when a usable object already exists.
- Searching and confirming a different project or lesson should remain available as an explicit change-context action.
- Simple relation actions should use one focused right-side action sheet with locked context, people search, selected summaries, and a compact save review.
- Multi-object creation flows can remain guided because those operations genuinely need staged decisions.

## What Changes

- Project and lesson workspaces default to the first available scene and show the scene summary, rosters, timeline, inheritance, and action buttons immediately.
- The existing modal locator is retained for explicit "change project" or "change lesson" recovery, not as a mandatory first screen.
- Project/lesson relation actions move from multi-step sheets to a single focused right-side sheet that keeps context, people selection, action details, and save summary visible together.
- Teacher access is narrowed to task-oriented work surfaces: dashboard, lesson scenes, students, assessment workspace, and reports.
- The dashboard becomes role-specific: teachers see "my today" and feedback actions; administrators see an operations cockpit.
- Generic resource tables are upgraded with TanStack Table behavior and clearly labeled as data maintenance rather than the primary teaching path.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `admin-scene-workflow-ux`: Reduce over-stepping in daily scene work, retain searchable context recovery, and make simple relation actions single-screen.
- `ops-admin-system`: Add role-specific SaaS workspace entry points and TanStack-backed data maintenance tables.
- `subproject-unit-test-coverage`: Extend admin tests to cover role-specific dashboards, teacher access boundaries, direct scene entry, single-screen relation actions, and TanStack table behavior.

## Impact

- Affected project: `ikanyue.admin`.
- Affected UI modules: `DashboardView`, `DataTable`, `ProjectSceneWorkspace`, `LessonSceneWorkspace`, `SceneComponents`, `ResourceView`, app permissions, and related tests.
- No backend API, PocketBase schema, or data migration is required.
- No Flutter work is included.
- The parent repository remains dependency-neutral; TanStack is added only inside the admin subproject.
