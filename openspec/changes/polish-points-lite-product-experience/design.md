## Context

The points-lite hard fork has only two operator destinations and one student-facing page, so its design should optimize repeated real-world handoff rather than broad dashboard discovery. Administrators stand at a service desk, select a learner, grant points, or confirm that a physical reward has been handed over. Students open the mini program to answer one question: what can I take now, and how close am I to the next reward?

The current implementation is functionally correct but exposes implementation-shaped UI: a fixed-width reward table on mobile, equally weighted grant and redemption forms, immediate mutations without a result preview, raw broken images, mixed English/Chinese labels, and separate Admin/miniapp color languages. The parent repository must remain dependency-neutral, and each submodule must keep its own tests and dependencies.

## Goals / Non-Goals

**Goals:**
- Make every points-lite workflow usable without horizontal scrolling at 320px and wider viewports.
- Let an administrator confirm the learner, action, reward, and resulting balance before any points mutation.
- Keep reward identity visible through a consistent image ratio and deterministic loading, empty, and error states.
- Make the mini program reward-first while preserving the current balance and affordability contract.
- Give Admin and mini program one visual language based on neutral ink, jade success, coral point emphasis, compact radii, and Chinese product copy.
- Keep affected production and test files below 500 lines by separating scene components.

**Non-Goals:**
- No API, PocketBase schema, authentication, ledger, or reward-price changes.
- No online redemption request, inventory, shipping, refunds, payment, or reservation behavior.
- No full-admin modules, marketing landing page, new root dependency, or root JavaScript workspace.
- No continuous Docker verification during implementation.

## Decisions

### Reward management uses a responsive catalog and inspector

Desktop Admin uses a dense catalog list beside a sticky inspector. The catalog is implemented as stable grid rows instead of a wide HTML table, so focusing an action cannot horizontally scroll the reward identity out of view. Mobile uses full-width reward rows containing image, name, price, status, and an edit affordance; editing opens a viewport-filling surface with its own header and close action.

The legacy image URL remains available under an advanced disclosure. Normal operators see the managed image upload first because that is the supported path.

Alternative considered:
- Keep the table and add horizontal scrolling: rejected because it hides the item identity and action columns during the primary mobile workflow.

### Points mutations use one action surface and explicit confirmation

The selected learner summary is locked context. Grant and redeem are modes in one action surface rather than two equally prominent forms. Submitting a mode opens a confirmation dialog that shows the learner, action description, current balance, delta, and resulting balance. The API call occurs only after confirmation.

Redemption confirmation includes reward name, image, and stored point price. Grant confirmation includes amount and reason. Existing backend price authority remains unchanged.

Alternative considered:
- Keep immediate form submission with a toast: rejected because the toast confirms only after an irreversible ledger event and does not prevent wrong-learner or wrong-amount mistakes.

### Event history adapts by viewport

Desktop retains a compact diagnostic table. Mobile renders the same events as a vertical timeline with action, amount, resulting balance, reason, and date grouped into readable blocks. Both presentations derive from the same event array and preserve all information.

### Reward media is a shared scene component per submodule

Admin introduces a reusable reward media component with loading, missing, loaded, and failed states. The mini program mirrors the same states locally because the submodules cannot share runtime dependencies. Both use a stable 4:3 frame, `object-fit`/`aspectFill`, and a neutral fallback carrying the reward initial.

The implementation does not retry broken URLs automatically. Operators can replace an invalid image; students receive a stable fallback without a broken browser control.

### The mini program prioritizes obtainable rewards

The mini program uses a compact balance summary rather than a large gradient hero. The first content section is “现在可以领取”, followed by “继续积累”. Locked rewards show a bounded progress bar and “还差 X 分”. Refresh and profile become compact familiar controls so they do not compete with reward content.

Loading uses reward-card skeletons. Authentication and network errors use distinct empty states with a direct login or retry action. No student-side redemption command is introduced.

### Visual tokens are mirrored, not packaged

Admin and Taro mirror a small documented token set inside their existing style systems:
- ink: primary commands and high-contrast text
- coral: point totals and progress emphasis
- jade: redeemable/success state
- blue: informational status only
- neutral white/gray surfaces with 8px maximum card radius

This avoids a cross-submodule design-system package and preserves independent builds.

## Risks / Trade-offs

- Confirmation adds one click to frequent actions → Keep the dialog compact, keyboard accessible, and focused on the exact before/after result.
- Mobile full-screen editing can obscure catalog context → Show reward name in the editor header and return to the same catalog position on close.
- Mirrored tokens can drift between submodules → Cover key state colors, labels, and media ratios in source-level tests and document the mapping in component names/styles.
- Mini program image error handling is platform-specific → Use Taro image error events and deterministic item-id state rather than browser-only behavior.
- Reward progress can divide by zero for malformed prices → Clamp progress to 0-100 and treat non-positive prices as zero progress in presentation logic.

## Migration Plan

1. Add Admin media, confirmation, action, catalog, and history scene components while preserving existing API props.
2. Replace the current points and reward layouts and update unit/E2E interaction tests.
3. Add mini program progress/media helpers, restructure the points page, and update unit/build tests.
4. Run Admin and Taro coverage, lint/build, mock E2E, and local live visual checks at desktop and mobile widths.
5. Roll back by reverting the Admin and Taro submodule commits; no data migration is required.

## Open Questions

- None blocking. Real production reward photography remains content work and is outside this implementation.
