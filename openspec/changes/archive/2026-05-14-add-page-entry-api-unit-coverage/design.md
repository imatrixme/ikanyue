## Context

The monorepo keeps the mini program and Hono API as independent submodules. Prior tests cover selected utilities and the WeChat login handler, but they do not follow the mini program's registered pages or prove the backend routes those pages use.

The reliable source of mini program entry points is `ikanyue.taro3/src/app.config.js`. The reliable source of mini program API calls is the `iNet` request wrapper usage inside those page modules and their imported helpers.

## Goals / Non-Goals

**Goals:**

- Build a page-entry inventory from registered mini program pages.
- Add unit tests around page logic that can run in Node/Vitest without WeChat DevTools.
- Add corresponding Hono request-level or handler-level tests for page-facing API routes.
- Keep test commands and dependency changes scoped inside each submodule.

**Non-Goals:**

- Do not add a root workspace, root package manager files, or cross-submodule test runner.
- Do not attempt full WeChat UI automation or Mini Program simulator tests.
- Do not cover routes that are not reachable from the registered mini program page set in this change.
- Do not require live PocketBase, WeChat, or network services.

## Decisions

1. Derive scope from `app.config.js` instead of filesystem page discovery.
   - Rationale: registered pages are the exposed product surface.
   - Alternative considered: test every page directory. Rejected because unregistered pages may be drafts or unused.

2. Test page logic through extracted helpers or mocked module boundaries.
   - Rationale: many Taro page files are Vue/Taro runtime modules that are brittle in Node tests.
   - Alternative considered: mount full pages. Rejected for this change because it would require runtime setup unrelated to API-flow correctness.

3. Match Hono tests to mini program request paths.
   - Rationale: backend coverage should prove the APIs used by the mini program, not just arbitrary utilities.
   - Alternative considered: blanket route coverage. Rejected for the first pass because it hides page/API mapping and expands scope too broadly.

4. Prefer request-level Hono tests with mocked PocketBase collections.
   - Rationale: request-level tests exercise route parsing, response middleware, query/body handling, and mapper behavior while staying local.
   - Alternative considered: unit-test only private helpers. Rejected because it misses endpoint contracts.

## Risks / Trade-offs

- Some page files may mix UI state and request orchestration tightly → Extract small pure helper modules only where needed.
- Some route modules may require external service clients at import time → Mock module cache or route dependencies locally in tests.
- Page/API mapping may reveal endpoints without backend implementations → Capture the gap in tests/tasks rather than inventing unrelated endpoints.
