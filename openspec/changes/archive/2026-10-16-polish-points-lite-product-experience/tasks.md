## 1. Admin Visual Foundation

- [x] 1.1 Align Admin semantic tokens and replace English task labels with Chinese product copy.
- [x] 1.2 Add a reusable stable reward-media component with loading, missing, and failed states.
- [x] 1.3 Add focused media and shell-copy unit coverage.

## 2. Responsive Reward Management

- [x] 2.1 Replace the fixed-width reward table with responsive catalog rows that keep identity and actions visible.
- [x] 2.2 Implement a sticky desktop inspector and viewport-filling mobile reward editor.
- [x] 2.3 Move the legacy image URL into an advanced disclosure and preserve managed upload behavior.
- [x] 2.4 Add desktop/mobile reward catalog interaction tests, including broken-image fallback.

## 3. Confirmed Admin Point Actions

- [x] 3.1 Refactor grant and redemption into one mode-based action surface under locked learner context.
- [x] 3.2 Add a confirmation dialog showing learner, action, delta, current balance, and resulting balance before API calls.
- [x] 3.3 Render point history as a mobile timeline and desktop compact table from the same events.
- [x] 3.4 Add tests proving cancel does not mutate, confirm mutates once, and before/after summaries are correct.

## 4. Reward-First Mini Program

- [x] 4.1 Add reward progress and resilient media-state helpers with unit coverage.
- [x] 4.2 Replace the large points hero with a compact summary and prioritize the “现在可以领取” section.
- [x] 4.3 Add locked-reward progress, compact refresh/profile controls, loading skeletons, login state, retry state, and image fallback.
- [x] 4.4 Align mini program semantic colors, typography, media ratio, radii, and Chinese labels with Admin.
- [x] 4.5 Update mini program build-facing E2E assertions for the new hierarchy and states.

## 5. Verification

- [x] 5.1 Run Admin unit coverage, lint, production build, and mock Playwright E2E.
- [x] 5.2 Run Taro unit coverage, WeChat build, and build E2E.
- [x] 5.3 Run local real-backend Admin smoke and visually inspect desktop/mobile catalog, confirmations, history, and media fallback.
- [x] 5.4 Verify no affected production, test, or support file exceeds 500 lines.
- [x] 5.5 Run strict OpenSpec validation and document any remaining production-content risk without running Docker.

## Verification Notes

- Docker verification was deliberately not run; it remains reserved for the final release check.
- Production reward names, descriptions, and object-storage images still require a final content pass, and the mini program needs a real WeChat device visual check before release.
