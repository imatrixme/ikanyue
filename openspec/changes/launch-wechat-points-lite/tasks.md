## 1. Branch And Release Boundary

- [ ] 1.1 Commit the hard-fork branch setup in the parent repo and affected submodules.
- [ ] 1.2 Keep the parent repository dependency-neutral and avoid root package/workspace/lockfile changes.
- [ ] 1.3 Document the final-only Docker release verification command set without adding it to normal development gates.

## 2. Hono Points And Rewards Backend

- [ ] 2.1 Add PocketBase schema ensure support for `student_points`, `point_events`, and `reward_items`.
- [ ] 2.2 Implement point balance snapshot and immutable point event services.
- [ ] 2.3 Implement reward catalog listing, create/update, and active-item validation.
- [ ] 2.4 Implement miniapp endpoints for student point summary and reward availability.
- [ ] 2.5 Implement lite admin endpoints for student point summary, point history, add-points, reward management, and offline redemption.
- [ ] 2.6 Hard-cut unrelated ops route registration from this release branch while preserving auth and required student lookup support.
- [ ] 2.7 Add Hono unit/API tests for all successful and rejected points/reward scenarios.

## 3. Lite Admin Frontend

- [ ] 3.1 Replace full ops navigation with lite points navigation and pages.
- [ ] 3.2 Implement student search, point balance, point history, and add-points UI.
- [ ] 3.3 Implement reward catalog management UI.
- [ ] 3.4 Implement offline redemption UI that sends only `studentId`, `itemId`, and optional remark.
- [ ] 3.5 Add admin unit tests and E2E tests covering login, student lookup, add-points, reward management, and offline redemption.

## 4. WeChat Mini Program

- [ ] 4.1 Add points/reward API client logic on the WeChat online baseline.
- [ ] 4.2 Add mini program page(s) for current points, redeemable rewards, and locked rewards.
- [ ] 4.3 Ensure no unrelated education-loop, report, pet, or admin functionality is introduced into the mini program release branch.
- [ ] 4.4 Add Taro unit tests and miniapp-facing E2E or integration tests for reward availability.

## 5. Coverage And Verification

- [ ] 5.1 Enforce and run at least 95% coverage for affected Hono code.
- [ ] 5.2 Enforce and run at least 95% coverage for affected admin code.
- [ ] 5.3 Enforce and run at least 95% coverage for affected Taro code.
- [ ] 5.4 Run local build/test/schema/E2E gates without Docker.
- [ ] 5.5 Run `openspec validate launch-wechat-points-lite --strict --no-interactive`.
- [ ] 5.6 Before release only, run Docker compose verification and smoke-test login, student reward listing, admin add-points, and offline redemption.
