## 1. Role-Safe Calendar Contract

- [x] 1.1 Make the Ops calendar endpoint accept academic or teacher capability and return a server-scoped teacher projection for teacher-only operators.
- [x] 1.2 Expand academic calendar teacher facets with verified, unblocked teacher display records while excluding account contact fields.
- [x] 1.3 Add Hono query, route, authorization, and compatibility tests for institution and cross-teacher scope behavior.

## 2. Scheduler State and Layout

- [x] 2.1 Add calendar mode, role-default, thirty-minute selection, repeat-date, overlap, and local-time helpers with focused unit tests.
- [x] 2.2 Add the academic teacher-resource day scheduler with click, drag, occupied-block, current-time, and stable-dimension behavior.
- [x] 2.3 Add role-aware toolbar and responsive behavior, including teacher-only week defaults and narrow-screen agenda fallback.

## 3. Context-Locked Lesson Creation

- [x] 3.1 Load named active class and course references only for academic operators and derive course, credit type, duration, location, and lead teacher context.
- [x] 3.2 Add the scheduling drawer with visible conflict feedback, draft/publish actions, and one/four/eight-week occurrence choices.
- [x] 3.3 Orchestrate draft creation and optional publication through existing academic commands, preserve partial-repeat outcomes, refresh the calendar, and keep server conflicts actionable.

## 4. Admin Authorization and Integration

- [x] 4.1 Allow teacher-capability accounts to access the calendar route and pass the authenticated profile into the workspace.
- [x] 4.2 Adapt calendar navigation, headings, filters, and lesson-detail actions for institution versus personal teacher contexts.
- [x] 4.3 Add Admin route, workspace, component, command, authorization, and responsive interaction tests.

## 5. Verification

- [x] 5.1 Run focused Hono and Admin tests, lint, and type/build checks for the affected scope.
- [x] 5.2 Run strict OpenSpec validation and confirm no PocketBase schema, root dependency, Taro, Website, Flutter, or mobile Nuxt changes.
- [x] 5.3 Start or reuse the local environment and visually verify academic day scheduling plus teacher personal-week behavior in desktop and narrow viewports.
