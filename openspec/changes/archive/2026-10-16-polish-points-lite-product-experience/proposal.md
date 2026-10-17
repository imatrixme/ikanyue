## Why

The points-lite release is functionally complete, but its current presentation still behaves like a generic desktop CRUD console and a separate generic points wallet. Mobile reward management loses critical columns, mutations do not preview their result, broken media is exposed directly, and the Admin and mini program do not yet feel like one coherent product.

## What Changes

- Replace the mobile reward table with scan-friendly reward rows and move editing into a responsive inspector that does not shift or hide list content.
- Add resilient reward media states for loading, missing, and failed images in both Admin and the mini program.
- Reframe point grants and offline redemption as actions on a locked learner context, with explicit before/after balance summaries and confirmation before mutation.
- Replace mobile point-history tables with an event timeline while retaining a compact diagnostic table on desktop.
- Make the mini program reward-first: surface currently redeemable items before secondary balance explanation, show progress toward locked rewards, and reduce competing text controls.
- Align Admin and mini program typography, status colors, media ratios, language, and interaction feedback without adding shipping, refunds, education management, or new backend domain behavior.

## Capabilities

### New Capabilities
- `points-lite-product-experience`: Responsive Admin and mini program presentation, mutation confirmation, resilient reward media, and shared points-lite visual behavior.

### Modified Capabilities

## Impact

- `ikanyue.admin`: points workspace, reward catalog/editor, shell copy, responsive layouts, confirmations, media components, and interaction tests.
- `ikanyue.taro3`: points page hierarchy, reward cards, progress presentation, media fallbacks, visual tokens, and page tests.
- Root OpenSpec artifacts and submodule pointers only; no root JavaScript dependencies.
- No Hono API or PocketBase schema changes are required.
