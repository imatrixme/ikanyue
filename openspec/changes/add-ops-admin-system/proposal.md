## Why

Kanyue needs a controlled operations system for teachers and administrators instead of asking staff to manipulate PocketBase directly. The first phase must establish a secure management boundary that can support mini program operations, future apps, teacher/student administration, activity/content operations, and flexible vocal assessment reports.

## What Changes

- Add a teacher/admin-only Ops API surface under `/ops/*` in the Hono service.
- Add a standalone `ikanyue.admin` project implemented with Vite, React, Tailwind CSS, shadcn-style components, and SSR-capable entrypoints.
- Add first-phase information management workflows for dashboard, students, teachers, activities, materials, miniapp operation slots, assessment templates, assessment records, report snapshots, share links, and audit logs.
- Add an assessment template/record/report model that stores searchable business fields separately from flexible JSON schema, answers, scoring, and report snapshots.
- Ensure PocketBase remains an internal data center accessed through Hono business APIs, not a direct teacher-facing admin surface.
- Add comprehensive local unit tests with at least 90% line, branch, and function coverage for affected Hono and admin code.
- Add core end-to-end tests covering login, RBAC, operations management, assessment submission, report snapshot creation, and share-link viewing.

## Capabilities

### New Capabilities
- `ops-admin-system`: Teacher/admin operations API and standalone SSR-capable admin information management system.
- `assessment-reporting`: Flexible assessment templates, scoring, report snapshots, and share links for student-facing assessment reports.

### Modified Capabilities
- `subproject-unit-test-coverage`: Extend the subproject coverage contract to include the new standalone admin project and enforce 90% coverage gates for newly affected subprojects.

## Impact

- `ikanyue.mapi.hono`: new `/ops/*` routes, operations services, RBAC guards, audit logging, assessment/reporting domain logic, and tests.
- `ikanyue.admin`: new standalone Vite React Tailwind SSR admin project with its own package metadata, tests, and Playwright e2e suite.
- `openspec`: new specs and tasks for first-phase operations system delivery.
- Parent repository: may register the new admin project path but must not add a root JavaScript workspace, root `package.json`, or root lockfile.
