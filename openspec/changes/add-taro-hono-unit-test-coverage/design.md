## Context

The parent repository now tracks the Taro mini program and Hono API as independent Git submodules. Each project keeps its own package manager files and development commands, so test coverage must be introduced inside each submodule rather than through a parent workspace.

The current priority is practical regression coverage for application logic that can be tested without launching WeChat tooling, browsers, PocketBase, or a production HTTP server.

## Goals / Non-Goals

**Goals:**

- Add maintainable unit tests in `ikanyue.taro3` and `ikanyue.mapi.hono`.
- Add or expose coverage commands inside each affected submodule.
- Keep test fixtures deterministic and local to each project.
- Verify the new tests with each project's own test runner.

**Non-Goals:**

- Do not introduce a root `package.json`, root workspace, or shared package manager lockfile.
- Do not add end-to-end tests, Mini Program simulator tests, browser tests, or API integration tests that require external services.
- Do not refactor unrelated application behavior.

## Decisions

1. Keep test tooling scoped per submodule.
   - Rationale: submodules are intended to iterate independently.
   - Alternative considered: root-level Turborepo or pnpm workspace. Rejected because it couples dependency installation and script naming across projects.

2. Prefer pure unit tests around existing logic boundaries.
   - Rationale: these tests run quickly and do not require platform tooling.
   - Alternative considered: app automation tests. Rejected for this change because the goal is coverage entry points, not UI workflow validation.

3. Use each project runner's native coverage mode.
   - Rationale: coverage output remains understandable to contributors working inside that submodule.
   - Alternative considered: shared coverage aggregation in the parent repository. Rejected until there is a concrete reporting requirement.

## Risks / Trade-offs

- Testable seams may be limited in the existing Taro project → Prefer small extracted pure helpers only when needed for meaningful unit tests.
- Hono API code may depend on runtime state or external services → Use request-level tests against the app object where available, and mock or avoid external dependencies.
- Coverage thresholds may fail immediately if enabled too aggressively → Add coverage commands first; only add thresholds if current coverage can satisfy them without broad, unrelated test work.
