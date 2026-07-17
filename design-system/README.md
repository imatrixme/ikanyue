# Kanyue Brand Design Tokens

`brand-tokens.json` is the cross-system source of truth for Kanyue visual tokens.

Token V2 is organized into four ownership layers:

- `foundation`: raw palette, type, spacing, radius, shadow, motion, breakpoint,
  z-index, and container scales
- `semantic`: product-facing color and paragraph roles
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

- `ikanyue.taro3/src/styles/_brand.generated.scss`
- `ikanyue.taro3/src/styles/theme.mjs`
- `ikanyue.admin/src/styles/brand.generated.css`
- `ikanyue.admin/src/styles/brand.generated.ts`
- `ikanyue.website/app/assets/css/brand.generated.css` when the website exists
- `ikanyue.website/app/utils/brand.generated.ts` when the website exists

Do not edit generated files directly. Platform components may add layout
geometry, but colors, typography, states, shared control geometry, and repeated
ticket patterns must use generated tokens. The parent remains dependency-neutral;
the generator uses only Node.js standard-library APIs and does not create a root
package or workspace.
