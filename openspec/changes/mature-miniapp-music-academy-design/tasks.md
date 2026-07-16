## 1. P0 Visual Foundation

- [x] 1.1 Replace the mini program color, shadow, typography, radius, and motion tokens with the restrained institutional system.
- [x] 1.2 Replace game-like English and role-number copy with Chinese-first account, state, reward, and activity language.
- [x] 1.3 Generate, process, visually inspect, and integrate six compact age-neutral transparent music still-life assets.
- [x] 1.4 Redesign the shared empty-state component without illustration frames, decorative blocks, or oversized imagery.

## 2. P0 Icon System

- [x] 2.1 Establish deterministic line-icon geometry, semantic colors, and generation tooling inside the Taro subproject.
- [x] 2.2 Regenerate the activity, points, and profile tab-bar icon pairs with consistent default and selected states.
- [x] 2.3 Regenerate all shared functional icons, remove obsolete assets, and verify every source reference resolves.

## 3. P1 Primary Page Hierarchy

- [x] 3.1 Rework the activity page into a quieter real-content-first event list with restrained loading, error, and empty states.
- [x] 3.2 Rework the points page into a compact points account ordered by balance, redeemable items, locked progress, and recent events.
- [x] 3.3 Rework the profile page into an identity and settings hierarchy that supports child, adult, and no-avatar learners.
- [x] 3.4 Rework the profile-editing page into a compact institutional form with a quieter red hero and preserved save/refresh behavior.

## 4. P1 Secondary Page Coherence

- [x] 4.1 Align activity detail and image detail media, loading, and error presentation with the new system.
- [x] 4.2 Align points history and reward catalog hierarchy, real media, progress, and empty states with the new system.
- [x] 4.3 Align page configuration, overscroll background continuity, native refresh, pagination, and short press feedback across registered pages.

## 5. P2 Verification

- [x] 5.1 Add a local visual fixture harness for child, adult, and no-avatar identities at 320px, 375px, and 430px widths.
- [x] 5.2 Capture and inspect responsive screenshots for overlap, truncation, hierarchy, age bias, and asset restraint.
- [x] 5.3 Update unit and build-facing E2E contracts for Chinese-first copy, page hierarchy, icon assets, and empty-state behavior.
- [x] 5.4 Run unit tests, WeChat production build, build-facing E2E, asset and package-size checks, file-length checks, and diff validation.
- [x] 5.5 Run strict OpenSpec validation and document remaining production-photo and real-device risks without Docker.

## Verification Notes

- Generated six 256x256 RGBA still-life assets and eighteen deterministic 96x96 RGBA icons; the WeChat package is 1020 KiB after the redesign.
- Captured and visually inspected child, adult, and no-avatar fixtures at 320px, 375px, and 430px. Automated browser geometry checks found no horizontal overflow, identity/action overlap, control overflow, or out-of-bounds primary button.
- Unit tests, H5 build, WeChat production build, and build-facing E2E pass. H5 retains existing Taro bundle-size warnings; Browserslist data is stale.
- ESLint and Stylelint dependencies exist but the subproject has no configuration files, so those commands cannot provide lint evidence. This pre-existing drift was not expanded into repository-wide lint setup.
- Docker was not run. Production activity/reward photography and final real-device gesture review remain release-content checks.
