## Context

The admin now has scene workspaces and guided flows, but applying the same stepper pattern to every action makes simple tasks feel harder than they are. A teacher entering a lesson scene is not trying to configure a data context; they are trying to see the lesson, understand who attends, record attendance, and write feedback. A teaching administrator entering a project scene wants to see whether students, teachers, and lessons are coherent before taking a corrective action.

The design therefore separates three interaction classes:

1. **Read and act in known context**: open a project or lesson scene directly when an object exists.
2. **Recover or change context**: use a modal locator with motive and searchable object rows.
3. **Create compound business flows**: keep guided workflows for activity publishing, signup conversion, batch lesson planning, and report launches.

## Decisions

### Decision: Direct scene entry for daily work

Project and lesson workspaces select the first available scene by default and immediately show a readable cockpit: summary, locked context, rosters, timeline or inheritance, and primary actions.

This favors the common case where the operator needs to understand and continue work, not configure the workspace.

### Decision: Context locator is recovery, not mandatory

The searchable scene setup modal remains available from "change project" and "change lesson". It still exposes motive, rows, status, and selected object summaries, but it no longer blocks the initial page when data is present.

If no usable object exists, the page shows an empty state and allows the operator to open the locator for confirmation or recovery.

### Decision: Simple relation actions are single-screen sheets

Adding project students, assigning project teachers, recording lesson attendance, and confirming lesson teachers happen from a locked scene. The parent context is already known, so the action sheet should not ask the operator to confirm it again as a step.

The sheet keeps four pieces visible:

- locked context summary
- relationship state or role
- searchable people rows with avatar/secondary info
- selected people and save summary

### Decision: Role-specific dashboard and permission boundaries

Teachers should not inherit the administrator's whole admin map. Their visible surfaces are dashboard, lesson scenes, students, assessment workspace, and reports. The teacher dashboard starts from "today's lesson" and feedback actions.

Administrators get an operations cockpit with activity signup conversion, lesson scheduling, guided operations, and relation gap checks.

### Decision: TanStack Table is for data maintenance

Generic tables remain useful, but they are an advanced maintenance surface. TanStack Table powers sorting, page-local filtering, row selection, and density control. Normal teaching actions still route through scene workspaces and guided flows.

## Risks / Trade-offs

- [Risk] Defaulting to the first scene may not always be the desired scene. → Mitigation: show the locked context clearly and provide an explicit change-context action.
- [Risk] Single-screen relation actions may hide the sense of "review". → Mitigation: keep a compact save summary visible at all times and disable save when context or selection is missing.
- [Risk] Teacher permission narrowing can remove an emergency maintenance path. → Mitigation: administrators retain full access; teacher paths focus on actual teaching work.
- [Risk] TanStack introduces a new dependency. → Mitigation: dependency stays inside `ikanyue.admin`; the parent repo remains dependency-neutral.
