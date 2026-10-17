## Why

The WeChat mini program needs a small production-ready points feature that can launch from the current online miniapp baseline without bringing the broader education-loop, report, or full admin functionality into the release. Operations staff need a clean offline redemption workflow where students can see point-priced physical rewards, and admins can add points or deduct points when a student takes an item in person.

## What Changes

- **BREAKING**: Create a hard fork release branch for this launch where `ikanyue.taro3` is based on the current WeChat online branch and the admin/API surfaces are cut down to the lite points workflow instead of exposing the full ops system.
- Add a lightweight points ledger for students with accumulation events, balance snapshots, admin-created point additions, and audited offline reward deductions.
- Add a physical reward catalog with active/inactive rewards and point prices.
- Add authenticated reward image upload through Hono into PocketBase file storage, with production reads served from the public MinIO bucket URL.
- Add mini program views/APIs for students to see current points, redeemable rewards, and locked rewards.
- Add lite admin views/APIs for login, student lookup, point balance/history, adding points, reward catalog management, and offline reward deduction.
- Add local non-Docker verification during development; reserve Docker compose validation for final release verification only.
- Raise affected subproject coverage gates for this release to 95% and add enough unit and end-to-end coverage for the lite points workflow.

## Capabilities

### New Capabilities
- `points-ledger`: Student point balance, accumulation events, admin adjustments, immutable point history, and balance snapshots.
- `offline-reward-redemption`: Physical reward catalog, miniapp reward availability, and admin-driven offline point deduction when the student takes a reward in person.

### Modified Capabilities
- `subproject-unit-test-coverage`: This release requires affected Taro, Hono, and admin code to enforce at least 95% coverage and include E2E coverage for the lite points workflows.

## Impact

- `ikanyue.taro3`: hard-forked from the WeChat online baseline; adds only points/reward display pages and request logic.
- `ikanyue.mapi.hono`: adds points/reward collections, services, routes, local schema ensure script, and tests; removes or avoids registering unrelated ops routes in the hard-fork release branch.
- `ikanyue.admin`: becomes a lite admin surface for points and reward management in this branch.
- `openspec`: adds contracts for points and offline redemption plus the 95% coverage requirement.
- No root package/workspace/lockfile is added; subprojects keep independent dependencies and verification commands.
- Docker verification is not part of regular development gates and is deferred to the final release gate.
