## Context

The parent repository remains a dependency-neutral Git submodule parent. The existing ops/admin rollout added Hono `/ops/*` routes, public operation slots, report share links, and a standalone admin app. The Taro mini program currently consumes operation slots on the activity home page and can open a report by share token, but it does not yet give logged-in students a report history, rich report rendering, or runtime-level confidence for the affected mini program paths.

The new work crosses `ikanyue.taro3` and `ikanyue.mapi.hono`. The public `/ops/share/:token` and `/ops/public/operation-slots` endpoints remain available for share links and public home operations. Student-owned report history should use `/v1/*` routes protected by the existing student auth model, not `/ops/*`, so teacher/admin operations and student mini program access keep separate trust boundaries.

## Goals / Non-Goals

**Goals:**

- Add a mini program report history entry reachable from the profile area for logged-in students.
- Render reports from a normalized privacy-safe payload whether they are opened by share token or by authenticated student ownership.
- Add student-facing Hono `/v1/*` report routes that list and open only the current student's report snapshots.
- Make home operation-slot loading independent from activity-list loading.
- Add unit/API coverage and a repeatable runtime verification script or checklist for the affected mini program flows.

**Non-Goals:**

- Do not move teacher/admin workflows into the mini program.
- Do not let student auth call `/ops/*` management routes or let ops tokens prove student ownership.
- Do not add a root JavaScript workspace, root package metadata, or shared root lockfile.
- Do not modify Flutter.
- Do not redesign unrelated mini program audio/video/profile flows beyond the report entrypoint needed for this change.

## Decisions

### Student report APIs live under `/v1/student/reports`

Student-owned report discovery will use authenticated `/v1/student/reports` endpoints. These routes will use the existing mini program auth middleware and derive `studentId` from the authenticated user context. They will not accept arbitrary `studentId` filters from the client.

Alternatives considered:

- Reuse `/ops/reports`: rejected because it is teacher/admin scoped and would blur session boundaries.
- Require every student view to use share tokens: rejected because students need a stable in-app history entry without external token distribution.

### Shared and student report views use one normalized payload contract

Hono will expose privacy-safe report content in a common shape for share-token and student-owned reads. Taro page logic will normalize summary fields, section details, comments, recommendations, generated date, and missing values before rendering.

Alternatives considered:

- Keep separate mappers for share and student views: rejected because it would create drift between report experiences.
- Render raw `reportJson` in the page: rejected because private fields and schema variants need a controlled projection.

### Operation slots and activities load independently

The activity home page will treat date/static navigation groups as a stable base, then merge operation slots when available and filter activities independently. If activities fail, the page can still show navigation groups. If operation slots fail, activities and static navigation remain usable.

Alternatives considered:

- Keep operation slots inside the activity request try/catch: rejected because a failure in one content source should not hide the other.
- Block the page until both sources complete: rejected because it worsens perceived reliability.

### Runtime verification is explicit and repeatable

The implementation will add a lightweight verification script or documented fixture-driven checklist in the Taro project that covers page registration, route targets, share-token opening, student-owned report navigation, invalid-token handling, and home operation-slot behavior. This supplements unit tests and the WeChat build; it does not claim full device certification.

Alternatives considered:

- Rely only on unit tests: rejected because previous coverage only proved helper logic, not mini program runtime constraints.
- Require manual real-device validation as the only gate: rejected because it is not repeatable in CI/local automation.

## Risks / Trade-offs

- [Risk] Student report APIs could leak another student's report if they trust client-provided IDs. Mitigation: derive ownership from auth context and verify `report.studentId` server-side before returning content.
- [Risk] Report JSON shape can vary by assessment template. Mitigation: normalize optional fields and test missing/alternate summary, section, comment, and recommendation shapes.
- [Risk] Operation-slot navigation can point to unsupported targets. Mitigation: omit unsupported/incomplete slots and test target generation.
- [Risk] Runtime verification cannot fully replace WeChat DevTools or real-device validation. Mitigation: include WeChat build plus repeatable scripted checks, and document the small manual smoke path for final release.
- [Risk] Adding report UI could push large Vue/test files over maintainability limits. Mitigation: keep report mapping in focused page logic files and split test helpers if files approach 500 lines.

## Migration Plan

1. Add OpenSpec specs and tasks for the mini program report experience.
2. Add Hono student report routes and tests using existing auth/test helpers.
3. Expand Taro report page logic and UI, add a report history page, and add a profile entry.
4. Refactor home operation-slot loading for independent fallback behavior.
5. Add Taro unit tests, Hono tests/coverage, WeChat build validation, and runtime verification support.
6. Validate OpenSpec and confirm the parent repository stays dependency-neutral.

Rollback is additive: remove the `/v1/student/reports` routes, mini program report-history page/entry, and operation-slot loading refactor while keeping existing share-token report viewing and ops/admin routes intact.
