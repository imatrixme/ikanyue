# Kanyue Brand Design Tokens

`brand-tokens.json` is the cross-system source of truth for Kanyue visual tokens.

Token V2 is organized into four ownership layers:

- `foundation`: raw palette, type, spacing, radius, shadow, motion, breakpoint,
  z-index, and container scales. Keys prefixed `miniapp` (`miniappSizePx`,
  `miniappWeight`, `miniappRadiusPx`, `shadow.miniapp`) feed only the mini
  program, which runs lighter weights and softer corners than the web.
- `semantic`: product-facing color and paragraph roles. `semantic.miniappColor`
  overrides existing `semantic.color` names for the mini program only (softer ink).
- `component`: shared control, table, navigation, overlay, focus, and disabled
  contracts
- `pattern`: reusable music-ticket and public-site editorial geometry

Platform components may keep local layout geometry when it is not reusable.
Generated platform files remain committed so each subproject can build
independently.

Synchronize generated files:

```sh
rtk node scripts/sync-design-tokens.mjs
```

Verify that generated files are current:

```sh
rtk node scripts/sync-design-tokens.mjs --check
```

Verify generated outputs and reject raw brand values in product components:

```sh
rtk node scripts/check-design-system.mjs
```

Generated outputs:

- `ikanyue.mini/miniprogram/styles/_brand.generated.scss` (pixel tokens as rpx, 375px design width = 750rpx; 1px hairlines and breakpoints stay px)
- `ikanyue.mini/miniprogram/styles/theme.js`
- `ikanyue.admin/src/styles/brand.generated.css`
- `ikanyue.admin/src/styles/brand.generated.ts`
- `ikanyue.website/app/assets/css/brand.generated.css` when the website exists
- `ikanyue.website/app/utils/brand.generated.ts` when the website exists

Do not edit generated files directly. Platform components may add layout
geometry, but colors, typography, states, shared control geometry, and repeated
ticket patterns must use generated tokens. The parent remains dependency-neutral;
the generator uses only Node.js standard-library APIs and does not create a root
package or workspace.

## Miniapp Course Navigation

Course shop and booking-list tabs reuse `segmented-control`, as course schedules
already do. Its compact tab height is separate from the touch-height action
buttons; using the same tokens does not justify a second tab implementation.
Course-shop entry rows use the existing `courses-action-list` container around
`account-row`. Immersive pages use `page-header` and set the `immersivePageChrome`
colors in the page JSON so the native navigation bar matches the content header;
page JSON cannot import tokens, so `check-design-system` rejects any color there
that is not a token value.
