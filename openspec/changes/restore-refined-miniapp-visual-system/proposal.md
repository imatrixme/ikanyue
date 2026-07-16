## Why

The latest mini program redesign solved age inclusivity by flattening the established visual hierarchy, leaving activity, points, and account pages less distinctive and less coherent than the earlier high-energy system. The product needs to recover that precise color-block rhythm and navigational clarity while replacing only the child-coded artwork and preserving the completed functional flows.

## What Changes

- Restore a high-contrast red, blue, yellow, ink, and warm-white token system with stable spacing, radius, shadow, typography, and press-state rules.
- Restore the earlier compact hero, colorful semantic icon block, section, card, progress, and account-menu hierarchy across all registered mini program pages.
- Preserve Chinese-first copy, real activity and reward media, age-neutral identity handling, profile editing, pull-to-refresh, pagination, loading, error, and empty states.
- Replace the current muted still-life treatment with original age-neutral music editorial assets using controlled screen-print color blocks and consistent scale.
- Add subtle reusable paper-grain, staff-line, and halftone textures only to hero and empty-state backing surfaces.
- Extend the visual fixture and screenshot checks to cover child, adult, and no-avatar identities at 320px, 375px, and 430px widths.
- Keep Admin, Hono, APIs, persistence, authentication, points rules, and deployment behavior unchanged.

## Capabilities

### New Capabilities
- `refined-miniapp-visual-system`: Defines the mini program's restored visual hierarchy, age-neutral artwork, restrained texture use, responsive states, and visual verification contract.

### Modified Capabilities

None.

## Impact

- Affects only `ikanyue.taro3` presentation files, local visual assets, asset-generation scripts, source-level UI contracts, and visual fixtures.
- Adds no runtime dependency and changes no API, schema, business rule, auth flow, or native page capability.
- The parent repository receives only this OpenSpec change and the updated Taro submodule pointer when committed.
