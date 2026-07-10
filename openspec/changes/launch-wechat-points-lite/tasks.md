## 1. Branch And Release Boundary

- [x] 1.1 Commit the hard-fork branch setup in the parent repo and affected submodules.
- [x] 1.2 Keep the parent repository dependency-neutral and avoid root package/workspace/lockfile changes.
- [x] 1.3 Document the final-only Docker release verification command set without adding it to normal development gates.

## 2. Hono Points And Rewards Backend

- [x] 2.1 Add PocketBase schema ensure support for `student_points`, `point_events`, and `reward_items`.
- [x] 2.2 Implement point balance snapshot and immutable point event services.
- [x] 2.3 Implement reward catalog listing, create/update, and active-item validation.
- [x] 2.4 Implement miniapp endpoints for student point summary and reward availability.
- [x] 2.5 Implement lite admin endpoints for student point summary, point history, add-points, reward management, and offline redemption.
- [x] 2.6 Hard-cut unrelated ops route registration from this release branch while preserving auth and required student lookup support.
- [x] 2.7 Add Hono unit/API tests for all successful and rejected points/reward scenarios.

## 3. Lite Admin Frontend

- [x] 3.1 Replace full ops navigation with lite points navigation and pages.
- [x] 3.2 Implement student search, point balance, point history, and add-points UI.
- [x] 3.3 Implement reward catalog management UI.
- [x] 3.4 Implement offline redemption UI that sends only `studentId`, `itemId`, and optional remark.
- [x] 3.5 Add admin unit tests and E2E tests covering login, student lookup, add-points, reward management, and offline redemption.

## 4. WeChat Mini Program

- [x] 4.1 Add points/reward API client logic on the WeChat online baseline.
- [x] 4.2 Add mini program page(s) for current points, redeemable rewards, and locked rewards.
- [x] 4.3 Ensure no unrelated education-loop, report, pet, or admin functionality is introduced into the mini program release branch.
- [x] 4.4 Add Taro unit tests and miniapp-facing E2E or integration tests for reward availability.

## 5. Coverage And Verification

- [x] 5.1 Enforce and run at least 95% coverage for affected Hono code.
- [x] 5.2 Enforce and run at least 95% coverage for affected admin code.
- [x] 5.3 Enforce and run at least 95% coverage for affected Taro code.
- [x] 5.4 Run local build/test/schema/E2E gates without Docker.
- [x] 5.5 Run `openspec validate launch-wechat-points-lite --strict --no-interactive`.
- [ ] 5.6 Before release only, run Docker compose verification and smoke-test login, student reward listing, admin add-points, and offline redemption.

## 6. Local Three-Client Environment Hardening

- [x] 6.1 Remove hard-coded administrator bootstrap credentials and make schema application create-only when explicitly enabled.
- [x] 6.2 Add localhost-only core schema and deterministic points/reward fixtures for an empty local PocketBase.
- [x] 6.3 Add a no-Docker local launcher for PocketBase, Hono, admin, and the Taro watcher.
- [x] 6.4 Add admin Vite proxying and a real-backend Playwright path while preserving the existing mock E2E suite.
- [x] 6.5 Align hard-fork submodule tracking branches and local environment documentation.
- [x] 6.6 Use a single reward-availability snapshot for miniapp balance and affordability display.
- [x] 6.7 Run focused tests, builds, schema checks, smoke-script safety checks, and strict OpenSpec validation.

## 7. Reward Image Storage

- [x] 7.1 Add a backward-compatible PocketBase reward image file field and public URL projection.
- [x] 7.2 Add an authenticated Hono multipart upload endpoint with image type and size validation.
- [x] 7.3 Add Admin file selection, upload progress state, preview, and image replacement workflow.
- [x] 7.4 Preserve legacy absolute image URLs and local PocketBase file URL fallback.
- [x] 7.5 Add Hono, Admin, live integration, build, coverage, and strict OpenSpec verification.
