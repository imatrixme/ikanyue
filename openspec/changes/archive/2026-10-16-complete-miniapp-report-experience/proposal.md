## Why

The operations/admin system now creates operation slots and assessment report shares, but the mini program only has a basic entrypoint and token viewer. Before release, the student-facing side needs a complete report experience, a logged-in report history entry, resilient operation-slot behavior, and verification that covers real mini program runtime paths rather than helper logic alone.

## What Changes

- Add a student-facing "My Reports" path in the Taro mini program so logged-in students can discover their assessment reports without relying only on externally shared tokens.
- Expand the mini program assessment report page to render richer report content, including section details, comments, recommendations, summary fields, empty states, and privacy-safe payload handling.
- Improve home operation-slot loading so public operation entries can render independently from activity-list failures and degrade without breaking the home page.
- Add Hono student-facing report APIs under `/v1/*` for authenticated students to list and open their own report snapshots while keeping `/ops/*` teacher/admin-only.
- Add mini program runtime verification support and tests for operation-slot display, report history navigation, shared report opening, invalid-token handling, and authenticated student report access.

## Capabilities

### New Capabilities
- `miniapp-report-experience`: Student-facing mini program report discovery, rich report rendering, resilient operation-slot navigation, and runtime verification.

### Modified Capabilities
- `assessment-reporting`: Add authenticated student-owned report viewing requirements without weakening teacher/admin Ops API boundaries.
- `miniapp-page-api-unit-coverage`: Extend page/API coverage expectations to include the new mini program report and operation-slot workflows.

## Impact

- `ikanyue.taro3`: report list/detail UI, profile entrypoints, operation-slot loading behavior, page logic, unit tests, and mini program runtime verification scripts or fixtures.
- `ikanyue.mapi.hono`: student-authenticated report read APIs, route tests, and coverage updates.
- `openspec`: new mini program report experience capability and deltas for assessment reporting and page/API coverage.
- Parent repository remains dependency-neutral with no root JavaScript workspace, root `package.json`, or root package-manager lockfile.
