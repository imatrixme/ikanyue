## Why

The Taro mini program and Hono API are now managed from a parent monorepo as independent submodules, but neither project has a clear cross-check for unit test coverage in day-to-day changes. Adding focused unit tests and coverage entry points now reduces regression risk while preserving each subproject's independent workflow.

## What Changes

- Add unit-test coverage support for selected Taro mini program logic.
- Add unit-test coverage support for selected Hono API logic.
- Keep dependency installation, scripts, and lockfiles scoped to each submodule.
- Document the expected per-project test and coverage commands in implementation tasks.

## Capabilities

### New Capabilities

- `subproject-unit-test-coverage`: Defines that the Taro and Hono subprojects expose maintainable unit tests and coverage commands for their own code.

### Modified Capabilities

None.

## Impact

- Affected projects: `ikanyue.taro3`, `ikanyue.mapi.hono`.
- Affected systems: local test tooling and coverage reporting inside each submodule.
- No parent workspace package manager or shared dependency graph is introduced.
