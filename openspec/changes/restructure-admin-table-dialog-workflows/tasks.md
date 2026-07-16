## 1. Shared Overlay And List Infrastructure

- [x] 1.1 Add a reusable dialog shell with title association, initial focus, focus trap, Escape handling, dismissal policy, and opener-focus restoration.
- [x] 1.2 Add reusable persisted-filter and client-side pagination helpers with malformed-storage fallbacks.
- [x] 1.3 Add responsive pagination, active-filter, and empty-state controls without introducing new dependencies.
- [x] 1.4 Add focused unit coverage for dialog lifecycle, persisted controls, and pagination behavior.

## 2. P0 Learner Points Restructure

- [x] 2.1 Replace the learner selector and persistent right workspace with a desktop learner table and mobile learner cards.
- [x] 2.2 Add direct learner row actions for grant, offline redemption, and detail with locked learner context.
- [x] 2.3 Replace the nested confirmation model with one point-action dialog that transitions between edit and review stages.
- [x] 2.4 Preserve entered action data on review cancellation and keep the dialog open when mutation requests fail.
- [x] 2.5 Update learner workflow unit and mock E2E tests for list-first navigation and single-overlay mutations.

## 3. P0 Reward Management Restructure

- [x] 3.1 Replace the reward catalog and permanent inspector with a desktop reward table and mobile reward cards.
- [x] 3.2 Move reward creation and editing into one responsive dialog while preserving managed upload and advanced legacy URL behavior.
- [x] 3.3 Add unsaved-change protection for close, Escape, and cancel paths without losing entered reward data on API failure.
- [x] 3.4 Update reward workflow unit and mock E2E tests for list-first navigation, dialog editing, and media fallback.

## 4. P1 Detail, Focus, And Responsive States

- [x] 4.1 Add a learner detail dialog with identity, balance, redeemable rewards, locked rewards, and complete point history.
- [x] 4.2 Render detail history as a compact desktop table and mobile timeline from the same event data.
- [x] 4.3 Add deterministic loading, true-empty, filtered-empty, request-failure, and retry/reset states for both primary pages.
- [x] 4.4 Verify focus containment, reverse focus traversal, Escape behavior, opener restoration, and one-overlay-only behavior in automated tests.
- [x] 4.5 Verify long mobile forms use a full-screen overlay and all affected 320px-767px surfaces avoid horizontal scrolling.

## 5. P2 Table Controls And Data Volume

- [x] 5.1 Add learner keyword, balance-range, and sorting controls with active-filter count and reset.
- [x] 5.2 Add reward keyword, status, point-range, and sorting controls with active-filter count and reset.
- [x] 5.3 Add client-side previous/next pagination that resets to page one when controls change.
- [x] 5.4 Persist only filter and sorting preferences in versioned local-storage keys and safely reject malformed or stale values.
- [x] 5.5 Add unit and E2E coverage proving filter, sort, reset, pagination, and preference restoration behavior.

## 6. Verification And Completion Audit

- [x] 6.1 Run Admin coverage thresholds, lint, production build, and mock desktop/mobile Playwright E2E.
- [x] 6.2 Run the local PocketBase/Hono/Admin smoke and live desktop/mobile Playwright E2E without Docker.
- [x] 6.3 Visually inspect learner table/cards, point dialogs, detail history, reward table/cards, reward editor, filtered-empty state, and mobile focus/overflow.
- [x] 6.4 Verify no affected production, test, or support file exceeds 500 lines and root dependency neutrality is preserved.
- [x] 6.5 Run strict OpenSpec validation and complete a requirement-by-requirement evidence audit for all P0, P1, and P2 scenarios.
