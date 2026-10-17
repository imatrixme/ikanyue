## Why

Current assessment reporting is centered on a single student assessment snapshot, but the real teaching workflow is looser: a package, trial, activity, or custom project can have uncertain sessions, changing teachers, changing students, absences, and multiple report kinds for students and teachers. The system needs a generic reporting domain so student reports, teacher feedback, session reviews, and program-level summaries can be issued from the same model without hard-coding every workflow into the legacy assessment tables.

## What Changes

- Add flexible learning programs and sessions that can represent course packages, trial lessons, activities, and ad hoc teaching projects with optional planned times and counts.
- Add many-to-many enrollment/assignment records so each program and each actual session can have different students and teachers.
- Add generic report templates, report events, evaluation inputs, report instances, and report recipients so one event can issue multiple reports of different types to students, teachers, or administrators.
- Preserve the existing assessment report behavior by mapping it onto the generic report model while keeping legacy public/share APIs compatible.
- Tighten report projection rules so public, student, and teacher-facing report responses use explicit whitelists and never leak raw PocketBase user fields.
- Extend admin workflows so operators can manage programs, sessions, report events, generated report instances, publication state, and recipient visibility.
- Extend mini program report viewing so students can see multiple reports from the same activity/program/session and distinguish report kinds.

## Capabilities

### New Capabilities
- `flexible-reporting-domain`: Loose program/session membership, generic report events, multi-recipient report instances, evaluation inputs, and report visibility rules.

### Modified Capabilities
- `assessment-reporting`: Existing student assessment records and report snapshots must integrate with the generic report model and privacy-safe report projection.
- `ops-admin-system`: Admin workflows must support program/session/report-event/report-instance management and role-scoped access.
- `miniapp-page-api-unit-coverage`: Mini program page/API coverage must include multi-report report history and detail behavior.

## Impact

- `ikanyue.mapi.hono`: PocketBase collection schema, report domain services, `/ops/*` management APIs, `/v1/student/reports` projections, authorization checks, and unit/coverage tests.
- `ikanyue.admin`: operations UI types, API client methods, program/session/report event management screens, report publication flows, and unit/coverage tests.
- `ikanyue.taro3`: report history/detail projections, report-kind display, multi-report states, and page/API unit tests.
- `openspec`: new capability spec plus deltas for assessment, admin, and mini program coverage requirements.
- No Flutter work and no root JavaScript workspace/dependency files are introduced.
