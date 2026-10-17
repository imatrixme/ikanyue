## Why

The current Admin timetable is optimized for reading existing lessons. Empty time is not actionable, creating a lesson requires switching workspaces and entering internal ids, and the same institution-wide default is unsuitable for a teacher who only needs to understand one personal week. Scheduling should begin from the visible time context while preserving the existing course-credit authorization boundary.

## What Changes

- Add a distinct browse/schedule mode to the Admin calendar while preserving the existing day, week, month, and list inspection flows.
- Give academic operators an expanded day scheduler grouped by teacher, with clickable or draggable empty time slots that open a context-locked lesson drawer.
- Replace raw course-credit and class id entry in this flow with named course and class selections, inherited teacher/time context, derived duration, conflict feedback, and explicit draft or publish outcomes.
- Give teacher-only Admin accounts access to the calendar, scope all returned lessons to the authenticated teacher, and default the scheduler to a personal week view with no academic create, publish, reschedule, or cancel authority.
- Preserve compact agenda behavior on narrow screens and keep existing lesson detail actions behind their current capabilities.

## Capabilities

### New Capabilities
- `visual-course-scheduler`: Defines role-aware visual scheduling modes, time-slot interaction, context-locked lesson creation, conflict feedback, responsive fallback, and teacher personal-week behavior.

### Modified Capabilities
- `ops-admin-system`: Allows teacher operators to enter a strictly teacher-scoped calendar workspace while retaining academic-only lesson creation and mutation.

## Impact

- `ikanyue.admin`: calendar route authorization, role-aware defaults, scheduler rendering, creation drawer, named reference loading, URL state, and interaction tests.
- `ikanyue.mapi.hono`: teacher-scoped Ops calendar reads and authorization tests; existing academic lesson command and publication services remain the only write path.
- Root: OpenSpec artifacts only; no root dependency or workspace changes.
- Not affected: PocketBase schema, Website, Taro mini program, Flutter, mobile Nuxt, production deployment, or teacher self-publication policy.
