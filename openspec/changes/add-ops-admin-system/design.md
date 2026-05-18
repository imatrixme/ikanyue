## Context

The parent `kanyue` repository is a Git-submodule parent with independent subprojects. The Hono service currently wraps PocketBase access for mini program APIs, but staff-facing management still lacks a controlled information-management surface. Direct PocketBase manipulation is unsafe for teachers, inconvenient for administrators, and cannot express application-level ownership checks, audit logs, template versioning, report snapshots, or share-link policies.

The first phase introduces a separate operations system:

- `ikanyue.mapi.hono` remains the data-center API service and owns `/ops/*` business rules.
- `ikanyue.admin` is a new standalone Vite + React + Tailwind + shadcn-style admin project with SSR entrypoints.
- PocketBase remains private persistence, never the teacher-facing admin system.

## Goals / Non-Goals

**Goals:**

- Provide teacher/admin-only login, session inspection, and role-aware management workflows.
- Centralize operations writes behind Hono `/ops/*` routes with server-side ownership checks.
- Provide first-phase modules for dashboard, students, teachers, activities, materials, miniapp operation slots, assessments, reports, share links, and audit logs.
- Store assessment data using searchable first-class fields plus flexible JSON for template schemas, answers, score details, and immutable report snapshots.
- Keep the parent repository dependency-neutral: no root JavaScript workspace, root `package.json`, or shared lockfile.
- Prove robustness with local unit coverage gates of at least 90% and core e2e flows.

**Non-Goals:**

- Full low-code form builder with arbitrary staff-authored scripts.
- Replacing PocketBase persistence in this phase.
- Rebuilding the existing Taro mini program.
- Implementing payment, full CRM automation, or advanced teacher scheduling.
- Granting teachers direct PocketBase admin access.

## Decisions

### Dedicated `/ops/*` API over reusing `/v1/*`

Ops routes will live under `/ops/*` and use a dedicated login path that only authenticates verified, unblocked teachers. Administrators remain modeled as teachers with `isAdmin`.

Alternatives considered:

- Reuse `/v1/user/login`: rejected because it can authenticate students and can auto-create student accounts.
- Use PocketBase admin UI: rejected because business ownership checks, workflow state, and audit requirements belong in the application layer.

### Standalone admin project

The admin surface will be a separate `ikanyue.admin` project. It will not be folded into the root as a workspace and will not replace the existing Nuxt activity site.

Alternatives considered:

- Add admin pages to `ikanyue.m.nuxt`: rejected because the user requires Vite + React + Tailwind + shadcn with SSR and an independent engineering boundary.
- Add a root workspace: rejected because the parent repo intentionally preserves independent subprojects.

### Service-layer business rules

The Hono implementation will add project-owned operations services for auth, RBAC, CRUD orchestration, assessments, reports, share links, and audit logging. Route handlers should stay thin.

Alternatives considered:

- Put all logic in route files: rejected because coverage and workflow tests would become brittle and route files would grow beyond maintainable size.
- Put business logic in PocketBase hooks: rejected because the public and ops API boundary should remain explicit in Hono.

### Assessment snapshots

Assessment records will store searchable fields such as `studentId`, `teacherId`, `templateId`, `status`, `totalScore`, and `grade`, while dynamic data lives in JSON fields. Submitted assessments generate immutable report snapshots so historical reports are not changed by later template edits.

Alternatives considered:

- Store the entire assessment as one JSON blob: rejected because management lists, filtering, permissions, and statistics need first-class fields.
- Normalize every item response into many tables: deferred because first-phase template flexibility is more important than analytics granularity.

### SSR-capable Vite app

The admin project will include a browser entry and a server rendering entry. Tests can validate SSR output without requiring production deployment.

Alternatives considered:

- Client-only Vite: rejected because the requested system explicitly requires SSR support.

## Risks / Trade-offs

- [Risk] New admin app increases repository surface area → Mitigation: keep it standalone with its own package metadata, tests, and scripts.
- [Risk] JSON-based assessment schemas can become inconsistent → Mitigation: validate template sections/items/scoring before publishing and before record submission.
- [Risk] Teacher ownership rules may be incomplete without mature class/course modeling → Mitigation: introduce `teacher_student_relations` as the first-phase authorization source and isolate future relation changes behind services.
- [Risk] End-to-end tests can become slow or flaky → Mitigation: use deterministic in-memory/mocked API mode for core admin e2e flows and keep live external services out of CI gates.
- [Risk] Coverage numbers can be misleading if only helper code is tested → Mitigation: include route/service workflow tests for auth, RBAC, CRUD, assessment submission, reporting, and share-link access.

## Migration Plan

1. Add OpenSpec specs and tasks for the first-phase operations system.
2. Implement Hono services and `/ops/*` routes while keeping existing `/v1/*` mini program APIs stable.
3. Add Hono unit and workflow tests with mocked PocketBase and coverage gates.
4. Add standalone `ikanyue.admin` Vite React SSR project with its own unit/e2e/build scripts.
5. Add admin unit tests and Playwright e2e tests.
6. Validate OpenSpec, coverage, e2e tests, builds, and parent repository neutrality.

Rollback is straightforward while the new routes/app are additive: remove `/ops/*` route registration and the standalone admin project pointer/files if the first phase must be backed out before release.

## Open Questions

- Whether `ikanyue.admin` should eventually be converted into a Git submodule with a separate remote. The first implementation can be a standalone project directory; if a remote is available later, register it as a submodule without adding a root workspace.
- Whether teacher-student ownership should later be derived from classes, lesson records, or scheduling. First phase uses an explicit relation model.
