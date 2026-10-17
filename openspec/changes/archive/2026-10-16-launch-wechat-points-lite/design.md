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

### Local three-client environment without Docker

The shared test environment is the developer workstation: PocketBase runs from a local binary, Hono listens on port 1337, the admin Vite server proxies `/ops` to Hono, and the Taro development build targets the same local API. A root shell launcher coordinates processes without adding a root JavaScript workspace.

Local bootstrap is explicit and guarded. It may create missing lightweight core collections and deterministic fixtures only against localhost. Schema application never embeds or resets an administrator password; optional administrator creation requires environment-provided credentials and is create-only.

The local PocketBase process disables automatic migration generation and uses an isolated empty migration directory. The ordered, idempotent bootstrap script owns local schema creation; this avoids same-timestamp API migrations replaying relation collections before their dependencies. The Taro watcher explicitly builds with `NODE_ENV=development` so `KANYUE_LOCAL_API_URL` is compiled into local artifacts without changing production builds.

Alternatives considered:
- Cloud staging: rejected for the current lightweight release because the user wants the test environment to point directly at the workstation.
- Development Docker compose: rejected because Docker remains a final release verification tool.
- Cross-origin admin API calls: rejected in favor of a Vite `/ops` proxy so local and production use the same frontend API path.

### Reward images owned by PocketBase storage

Reward records retain the legacy `image` URL field and add a single-file `imageFile` field. Admin uploads use an authenticated Hono multipart endpoint; Hono forwards the file to PocketBase, and PocketBase owns S3/MinIO persistence and replacement cleanup. Admin never receives PocketBase superuser credentials or MinIO write credentials.

API projections expose one `image` URL. When `PUBLIC_ASSET_BASE_URL` is configured, Hono maps the PocketBase file key to `{base}/{collectionId}/{recordId}/{filename}` so mini program and admin reads go directly to the public MinIO bucket or CDN. Without that setting, local development falls back to the PocketBase `/api/files` URL. Existing absolute `image` URLs remain valid until records are replaced with uploaded files.

Alternatives considered:
- Browser-to-PocketBase upload: rejected because the admin uses a Hono JWT and direct upload would require a second browser-visible PocketBase authorization boundary.
- Browser-to-MinIO presigned upload: rejected for this release because it bypasses PocketBase file ownership and adds signing/lifecycle code that is unnecessary for low-volume admin uploads.

## Risks / Trade-offs

- Hard-fork drift → Keep branch-specific changes focused and preserve project skeletons so future full-admin merge conflicts stay localized.
- PocketBase multi-collection consistency limits → Keep each mutation inside the backend service, add idempotent tests where practical, and write ledger/snapshot updates in a single service path.
- Balance snapshot drift → Validate event totals against snapshot in tests and provide a repair/recompute helper if drift is later found.
- Local bootstrap misuse → Refuse local fixture resets for non-loopback PocketBase hosts and require explicit bootstrap flags.
- Split student snapshots → Use reward availability's `currentPoints` and reward groups as one student-page snapshot instead of parallel balance requests.
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
