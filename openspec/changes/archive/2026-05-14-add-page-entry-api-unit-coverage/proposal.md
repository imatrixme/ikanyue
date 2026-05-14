## Why

The previous coverage work proved selected utilities and one Hono flow, but it did not prove the mini program's exposed page flows or the Hono endpoints those pages call. This change makes coverage follow the actual product entry points so test evidence matches user-facing behavior.

## What Changes

- Inventory the pages registered by `ikanyue.taro3/src/app.config.js`.
- Identify request paths used by those exposed pages through the mini program request layer.
- Add Taro unit tests for page-entry logic that can run without WeChat DevTools.
- Add Hono unit or request-level tests for API routes paired with those page requests.
- Keep all tooling scoped inside the existing submodules; do not introduce a root JavaScript workspace.

## Capabilities

### New Capabilities

- `miniapp-page-api-unit-coverage`: Covers test expectations for exposed mini program page entry logic and matching Hono API routes.

### Modified Capabilities

- None.

## Impact

- `ikanyue.taro3`: page logic, extracted page helpers if needed, Vitest tests, and coverage configuration.
- `ikanyue.mapi.hono`: route-level tests for page-facing endpoints, test fixtures/mocks, and coverage commands as needed.
- Parent monorepo: OpenSpec artifacts and submodule pointer updates only.
