# Kanyue Brand Design Tokens

`brand-tokens.json` is the cross-system source of truth for Kanyue visual tokens.

It defines brand and semantic colors, typography, paragraph rhythm, spacing,
radius, shadow intent, and motion timing. Generated platform files remain
committed so each subproject can build independently.

Synchronize generated files:

```sh
rtk node scripts/sync-design-tokens.mjs
```

Verify that generated files are current:

```sh
rtk node scripts/sync-design-tokens.mjs --check
```

Generated outputs:

- `ikanyue.taro3/src/styles/_brand.generated.scss`
- `ikanyue.taro3/src/styles/theme.mjs`
- `ikanyue.admin/src/styles/brand.generated.css`

Do not edit generated files directly. Platform components may add layout
geometry, but colors and typography must use the generated semantic tokens.
