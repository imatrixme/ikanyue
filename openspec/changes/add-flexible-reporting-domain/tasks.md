## 1. PocketBase Schema And Domain Model

- [x] 1.1 Add PocketBase collection definitions for learning programs, learning sessions, program/session participants, report templates, report events, evaluation inputs, report instances, and generic report share/source metadata.
- [x] 1.2 Update schema check/apply tests or fixtures so relation fields, select values, JSON fields, and safe indexes are validated without touching Flutter or root workspace files.
- [x] 1.3 Add migration/backfill helpers or service paths that can expose existing assessment snapshots as generic report instances without breaking legacy assessment routes.

## 2. Hono Reporting Services And APIs

- [x] 2.1 Implement program/session/participant service logic with role-scoped authorization and deterministic in-memory test support.
- [x] 2.2 Implement report template, report event, evaluation input, report instance generation, publication, revocation, and listing services.
- [x] 2.3 Add `/ops/*` routes and handlers for program/session/report-event/report-instance workflows with admin and assigned-teacher access checks.
- [x] 2.4 Extend `/v1/student/reports` list/detail APIs to merge legacy assessment snapshots and published generic report instances addressed to the authenticated student.
- [x] 2.5 Add teacher-recipient report access for published teacher feedback reports without exposing unrelated student or admin reports.
- [x] 2.6 Replace report response deny-list sanitization with whitelist projections for student, teacher, subject, recipient, template, scope, score, sections, and recommendations.

## 3. Admin UI Workflows

- [x] 3.1 Add admin API client types and methods for learning programs, sessions, report templates, report events, evaluation inputs, and report instances.
- [x] 3.2 Add admin navigation and management views for learning programs, sessions, report events, and report instances while preserving existing dashboard, student, teacher, activity, material, assessment, and share-link flows.
- [x] 3.3 Update assessment/report workspaces so administrators can select student/template/scope explicitly instead of relying on first available records.
- [x] 3.4 Add report publication/revocation UI states and teacher/admin role-scoped navigation behavior.

## 4. Mini Program Report Experience

- [x] 4.1 Update report history page logic to display multiple report kinds from the same activity/program/session with stable ordering and labels.
- [x] 4.2 Update report detail logic to render the generic report projection envelope while keeping legacy assessment report payloads compatible.
- [x] 4.3 Add mini program empty/error states for draft, revoked, missing, or unauthorized report detail responses.

## 5. Tests And Coverage

- [x] 5.1 Add Hono unit tests for schema definitions, report projection privacy, program/session authorization, report event generation, student report merge behavior, teacher feedback report access, and denial paths.
- [x] 5.2 Add admin unit tests for API client mapping, navigation/resource behavior, explicit assessment selections, report event workflows, and report instance publication states.
- [x] 5.3 Add Taro unit tests for multi-report history, generic report detail rendering, legacy compatibility, and unauthorized/error states.
- [x] 5.4 Run Hono coverage with thresholds at or above 90 percent and record the command/result.
  - Result: `rtk npm run test:coverage` in `ikanyue.mapi.hono` passed with 91 tests, line 94.75%, branch 90.12%, functions 96.13%.
- [x] 5.5 Run admin coverage with thresholds at or above 90 percent and record the command/result.
  - Result: `rtk npm run test:coverage` in `ikanyue.admin` passed with 42 tests, statements 94.61%, branch 90.03%, functions 96.92%, lines 94.5%.
- [x] 5.6 Run Taro coverage with thresholds at or above 90 percent and record the command/result.
  - Result: `rtk npm run test:coverage` in `ikanyue.taro3` passed with 56 tests, statements 98.3%, branch 90.6%, functions 100%, lines 98.3%.

## 6. Validation And Deployment Readiness

- [x] 6.1 Run OpenSpec validation/status checks for `add-flexible-reporting-domain`.
  - Result: `rtk openspec validate add-flexible-reporting-domain --strict --json --no-interactive` passed; `rtk openspec status --change "add-flexible-reporting-domain" --json` reports all artifacts done.
- [x] 6.2 Run focused build/lint gates for affected subprojects.
  - Result: Hono `rtk npm run lint` and `rtk npm run ops:schema:check` passed; admin `rtk npm run lint` and `rtk npm run build` passed; Taro `rtk npm run verify:miniapp-report-runtime` and `rtk npm run build:weapp` passed.
- [x] 6.3 Document Docker/PocketBase backup, schema migration, bypass verification, image rollback, and data rollback notes for deployment handoff.
  - Result: added `deployment-notes.md` for PB backup, idempotent schema apply, bypass verification, OpenResty switch, Docker image rollback, and PB data restore order.
