## 1. Inventory

- [x] 1.1 Read `ikanyue.taro3/src/app.config.js` and list registered page entries.
- [x] 1.2 Trace each registered page's `iNet` calls and imported request helpers.
- [x] 1.3 Map traced mini program request paths to Hono route modules.

## 2. Taro Page Logic Tests

- [x] 2.1 Identify page logic that can be extracted or tested without WeChat DevTools.
- [x] 2.2 Add Vitest tests for covered page-entry request/data-flow logic.
- [x] 2.3 Update Taro coverage configuration only for the newly tested page logic scope.

## 3. Hono Matching API Tests

- [x] 3.1 Add local request-level tests for Hono routes called by the covered pages.
- [x] 3.2 Mock PocketBase or other external dependencies at the route boundary.
- [x] 3.3 Keep Hono coverage thresholds active and passing.

## 4. Verification and Integration

- [x] 4.1 Run Taro unit and coverage commands.
- [x] 4.2 Run Hono unit, lint, and coverage commands.
- [x] 4.3 Verify each `*.test.js` and `test/support/*.js` helper file is 500 lines or fewer.
- [x] 4.4 Commit affected submodules and update parent submodule pointers with OpenSpec artifacts.
