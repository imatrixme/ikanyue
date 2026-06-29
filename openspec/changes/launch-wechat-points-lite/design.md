## Context

The parent repository is a submodule-based monorepo. The mini program, Hono API, and admin app keep independent dependencies, locks, tests, and release cadence. The current `2605/newop` line contains broader education-loop and reporting work that must not ship in the lightweight WeChat points release.

This change uses a hard release fork named `release/wechat-points-lite`. The mini program submodule is based on the WeChat online baseline (`ikanyue.taro3` branch `2604/jieshao`) and only receives points/reward display work. The admin and Hono submodules stay on a same-named release branch but are cut down directly for this release line instead of adding a feature flag or `OPS_LITE_MODE`.

Docker compose is not a development-time verification loop for this change. Local unit, coverage, build, schema, and E2E commands are the normal gates. Docker is reserved for one final release verification pass.

## Goals / Non-Goals

**Goals:**
- Ship a minimal student points and offline reward redemption feature in the WeChat mini program.
- Provide a lite admin that can manage students' points and physical reward items.
- Keep an immutable points ledger so every addition and offline deduction can be audited.
- Keep the student-facing reward display simple: current points, redeemable items, and locked items.
- Enforce at least 95% coverage for affected subproject logic and include E2E coverage of the critical lite flows.
- Preserve parent repository dependency neutrality.

**Non-Goals:**
- No shipping, refund, online order, payment, frozen-points, inventory reservation, or fulfillment workflow.
- No virtual pet food redemption in this release.
- No `OPS_LITE_MODE`, runtime feature flag, or hidden full-admin routes for this release branch.
- No Docker compose verification during normal iteration.
- No attempt to merge the full admin surface into the mini program release branch now.

## Decisions

### Hard fork instead of mode flag

The release branch directly removes or stops registering unrelated admin/API functionality. The lite admin routes and Hono ops routes contain only the capabilities required by points and offline rewards.

Alternatives considered:
- `OPS_LITE_MODE`: rejected because the user wants a hard fork with the unrelated functionality cut cleanly.
- New separate service: rejected because this release is small and depends on existing student/admin authentication.

### Ledger first, balance snapshot second

`point_events` is the source of truth. `student_points` is a balance snapshot used for fast reads and miniapp display. Every balance mutation writes a point event and updates the snapshot through the backend service.

Alternatives considered:
- Store only `students.points`: rejected because it loses auditability and makes offline deductions hard to explain.
- Full order ledger: rejected because there is no order, shipping, refund, or online checkout requirement.

### Backend owns point prices and deductions

Admin offline redemption requests pass `studentId` and `itemId`. The backend reads the active reward item's `pointsPrice`, checks the student's current balance, and writes the negative point event. The browser cannot choose the deduction amount for an item.

Alternatives considered:
- Admin submits arbitrary deduction amount: rejected because edited requests could deduct the wrong amount.
- Create redemption orders: rejected because the student takes the physical item immediately offline.

### Lite admin as a direct app cut

The admin release branch keeps the project shell, auth client, tests, and build tooling, but replaces the broad ops navigation/workflows with points-oriented pages.

Alternatives considered:
- New admin project: rejected because it adds build/deploy overhead and makes future merging harder.
- Hide pages only in navigation: rejected because hard fork must cut the unrelated business surface.

### Final-only Docker verification

Development uses local commands. Docker compose is run only before release to prove the deploy shape.

Alternatives considered:
- Continuous Docker verification: rejected by user because it wastes resources before release certainty.

## Risks / Trade-offs

- Hard-fork drift → Keep branch-specific changes focused and preserve project skeletons so future full-admin merge conflicts stay localized.
- PocketBase multi-collection consistency limits → Keep each mutation inside the backend service, add idempotent tests where practical, and write ledger/snapshot updates in a single service path.
- Balance snapshot drift → Validate event totals against snapshot in tests and provide a repair/recompute helper if drift is later found.
- Admin accidental overreach → Remove or stop registering unrelated lite-branch UI/API routes instead of relying on hidden navigation.
- Coverage target pressure → Scope tests to affected logic and split large test files so no production, test, or helper file exceeds the 500-line preference.

## Migration Plan

1. Create `release/wechat-points-lite` in the parent repo and affected submodules.
2. Point `ikanyue.taro3` at the WeChat online baseline before applying points work.
3. Add PocketBase schema ensure support for `student_points`, `point_events`, and `reward_items`.
4. Implement Hono points/reward services and lite routes.
5. Cut admin to lite points/reward management.
6. Add miniapp points/reward display.
7. Run local unit, coverage, build, schema, and E2E gates.
8. Before release only, run Docker compose validation and smoke test login, reward listing, add-points, and offline redemption.
