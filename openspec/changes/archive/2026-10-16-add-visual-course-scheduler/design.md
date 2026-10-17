## Context

See `proposal.md` for motivation. The current Admin calendar reads the academic-only `/ops/course-calendar` projection and renders day/week/month/list views. Lesson creation is a separate raw-id form, while the formal write path already enforces draft-first creation, class publication, teacher overrides, roster materialization, schedule claims, and academic capability checks.

The existing `sessions` projection remains the schedule source. The change crosses Hono authorization/query behavior and the Admin route, calendar renderer, command orchestration, and tests, but it does not require a new collection or production dependency.

## Goals / Non-Goals

**Goals:**

- Make the visible calendar the starting point for academic lesson creation.
- Give academic operators a teacher-resource day scheduler and teacher-only operators a personal week default.
- Keep authorization and final schedule conflict enforcement in Hono.
- Replace raw ids in the scheduler flow with named class and course choices.
- Preserve URL-stable browse behavior and existing lesson detail actions.

**Non-Goals:**

- Teachers do not create, publish, reschedule, or cancel formal lessons in this change.
- Existing lesson blocks are not directly moved or resized; they continue to use explicit detail actions.
- No room-resource model, recurrence series entity, external calendar sync, or PocketBase schema change.
- The standalone mini program teacher calendar is not changed.

## Decisions

### 1. Make the existing Ops calendar endpoint role aware

The route accepts either academic or teacher capability. Academic users keep the institution projection. Teacher-only users are routed to a new Ops-shaped teacher projection that scopes session ids through `session_teachers.teacherId` before loading session data.

The teacher projection retains fields the Admin calendar needs but is filtered server-side. The client never supplies a trusted teacher scope. Alternative: call `/v1/teacher/schedule` from the Admin. Rejected because its intentionally reduced public DTO omits Admin calendar fields and would couple the Ops client to a second API base.

### 2. Keep formal writes on existing academic commands

The creation drawer calls the existing draft lesson command and optionally the existing publication command with the selected teacher as a lead `teacherOverride`. Hono continues to require academic capability for both commands and the publication service remains the final conflict authority.

Alternative: add a scheduler-specific batch write endpoint. Rejected because the current request does not require transactional recurrence and duplicating the established publication domain would increase data and authorization risk.

### 3. Separate browse and schedule presentation without duplicating calendar state

`mode`, `view`, `date`, and filters stay in the URL. Browse mode retains all four views. Schedule mode uses day/week only: academic users default to day, teacher-only users default to week. Teacher-only mode removes institution filters and creation affordances.

The resource day grid is a dedicated component. It uses fixed thirty-minute cells for pointer and keyboard selection, teacher rows, horizontal time, and positioned lesson blocks. This avoids a new calendar dependency and makes click and drag behavior deterministic in tests.

### 4. Load reference choices from existing read models

The institution calendar response expands its teacher facet to all verified, unblocked teachers so an academic operator can schedule someone with no lesson in the current range. Active classes and course specs come from existing course resource APIs. Selecting a class derives its default credit type, course, location, and course duration.

Teacher-only users do not load academic reference lists because they cannot create.

### 5. Treat client conflict checks as previews

The drawer compares the proposed intervals with currently loaded entries for the selected teacher and class. A visible hard overlap disables publish but permits saving a draft. The publication service and schedule claims remain authoritative; a server conflict refreshes the calendar and leaves the creation context open.

### 6. Implement repeats as explicit occurrences

The first release offers one, four, or eight weekly occurrences. The client creates each occurrence in order using a distinct lesson code and existing idempotent commands. It stops on the first failure and reports completed occurrence counts. No hidden recurrence series or partial rollback is implied.

## Risks / Trade-offs

- [A repeat can partially succeed] -> stop at the first failure, report exact completed counts, and leave already-created lessons visible after refresh.
- [Calendar data can become stale between preview and publish] -> keep server schedule claims authoritative and refresh after conflict responses.
- [A large teacher roster can make the resource grid tall] -> use stable row heights, horizontal time scrolling, and the existing page scroll instead of rendering nested cards.
- [Teacher access broadens a previously academic-only route] -> scope session ids before projection and add explicit cross-teacher denial tests.
- [Teacher names are account data] -> expose only id and public display name to academic users; omit contact and authentication fields.

## Migration Plan

1. Deploy Hono role-aware calendar reads while retaining academic response compatibility.
2. Deploy the Admin route authorization and role-aware workspace.
3. Enable scheduler creation affordances only for academic operators.
4. Roll back the Admin first if needed; the widened read route remains backward compatible and can then be reverted independently.
