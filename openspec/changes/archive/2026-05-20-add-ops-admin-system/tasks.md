## 1. Hono Ops API Foundation

- [x] 1.1 Add operations domain helpers for roles, ownership checks, validation, audit logging, and response-safe projections.
- [x] 1.2 Add `/ops/auth/login`, `/ops/auth/me`, and teacher/admin-only session middleware that never authenticates students or auto-creates accounts.
- [x] 1.3 Register `/ops/*` routes without changing existing `/v1/*` mini program behavior.

## 2. Hono Information Management

- [x] 2.1 Implement dashboard, student, teacher, activity, material, operation-slot, report, share-link, and audit-log management services.
- [x] 2.2 Implement server-side teacher ownership checks through `teacher_student_relations`.
- [x] 2.3 Implement audit events for allowed and denied security-sensitive operations.

## 3. Assessment Reporting

- [x] 3.1 Implement assessment template validation, draft creation, and publishing.
- [x] 3.2 Implement assessment draft creation, answer saving, submission, scoring, and grade calculation.
- [x] 3.3 Implement immutable report snapshot creation and public share-link read APIs that exclude private fields.

## 4. Standalone Admin App

- [x] 4.1 Create standalone `ikanyue.admin` Vite React project with Tailwind CSS, shadcn-style primitives, SSR browser/server entrypoints, and independent package scripts.
- [x] 4.2 Implement admin auth, dashboard, and first-phase information-management screens using `/ops/*` APIs only.
- [x] 4.3 Implement assessment template, assessment submission, report snapshot, and share-link workflows in the admin UI.

## 5. Tests and Coverage

- [x] 5.1 Add Hono unit and workflow tests for ops auth, RBAC, management modules, assessment scoring, report snapshots, share links, and audit logging.
- [x] 5.2 Add admin unit tests for API client, state/workflow logic, SSR rendering, and key React components.
- [x] 5.3 Add admin Playwright e2e tests for login, dashboard, management workflows, assessment submission, share-link viewing, and authorization denial.
- [x] 5.4 Enforce at least 90% line, branch, and function coverage for Hono and admin coverage commands.

## 6. Verification

- [x] 6.1 Run Hono lint, unit tests, and coverage from `ikanyue.mapi.hono`.
- [x] 6.2 Run admin lint, unit coverage, e2e tests, and build from `ikanyue.admin`.
- [x] 6.3 Run `openspec validate add-ops-admin-system --strict --no-interactive`.
- [x] 6.4 Confirm the parent repository has no root JavaScript workspace, root `package.json`, or root package-manager lockfile.
- [x] 6.5 Perform completion audit mapping every requested deliverable to real implementation and test evidence.
