## Context

Kanyue Art's WeChat mini program serves children, their parents, and adult learners through the same activity, points, reward, and profile flows. The current implementation is functionally complete and already supports pull-to-refresh, pagination where needed, reward availability, profile editing, and resilient data states, but its saturated red/blue/yellow palette, clay characters, large decorative empty states, and game-like English labels communicate a children-only product.

The implementation remains inside `ikanyue.taro3`. The parent repository stays dependency-neutral, existing APIs and data contracts remain authoritative, and Docker remains reserved for release verification.

## Goals / Non-Goals

**Goals:**
- Establish one contemporary music-school visual language that remains welcoming to children without infantilizing adult learners.
- Make real activity content, point balances, reward availability, and learner identity more prominent than decoration.
- Use Chinese-first product copy and reserve English for the Kanyue brand signature only.
- Replace character-led empty states with compact, age-neutral music still lifes.
- Provide one coherent icon grammar across tab navigation and page actions.
- Preserve native scrolling, pull-to-refresh, existing data loading, authentication, and business behavior.
- Verify child, adult, and no-avatar identities at 320px, 375px, and 430px widths.

**Non-Goals:**
- No separate child and adult themes or account preference.
- No API, PocketBase, authentication, points ledger, reward price, inventory, shipping, reservation, or online redemption changes.
- No redesign of Admin or Hono.
- No marketing landing page, custom font download, runtime icon package, or Docker verification.

## Decisions

### The product uses one institutional base rather than age-specific themes

The base language uses warm neutral surfaces, deep ink, a restrained institutional red, muted blue for information, and muted gold for points. Children and adults see the same hierarchy; age variation comes from real activity photography and user avatars rather than theme switching.

Alternative considered:
- Child/adult theme selection: rejected because it creates configuration and QA branches while implying that professional clarity is unsuitable for children.

### Chinese product copy carries the hierarchy

Functional headings, status labels, empty-state copy, and account actions use direct Chinese. English is limited to a stable Kanyue brand signature and is removed from error states, role numbering, progress labels, and account commands. "音乐家" remains available as a warm identity expression, while utility labels use "个人资料", "学员档案", and "积分账户".

Alternative considered:
- Keep uppercase English as decorative eyebrows: rejected because it adds reading noise and preserves the game/profile-card tone.

### Empty states are small music still lifes, not characters

Six transparent raster illustrations cover activity, network, points, rewards, image, and account identity states. Each asset uses a single recognisable music-related object, dark linework, warm neutral fill, and at most one institutional-red accent. No people, faces, stars-as-characters, toy rendering, text, shadows, or age markers are allowed. The shared component presents the asset without a framed illustration card and limits it to a supporting 80-104px visual.

Alternative considered:
- Keep the clay art at a smaller size: rejected because the child-oriented material and character proportions remain even when scaled down.

### Real content is the visual focal point

Activity rows retain real event covers where available and use a stable neutral media fallback otherwise. Reward rows retain managed product photography and present affordability as text and progress rather than decorative badges. Profile screens use the learner's avatar or initials. Hero regions remain solid institutional red for continuity but become shorter, quieter, and typography-led.

### Icons use one deterministic line grammar

Tab and functional icons use a 24px optical grid, rounded caps and joins, consistent stroke weight, dark-neutral default color, and institutional-red selected color. Tab meanings remain activity calendar/note, points ledger/coin, and profile person. Runtime continues to consume PNG assets because native WeChat tab bars require file paths; the visual source is deterministic vector geometry and does not add a runtime dependency.

### Motion is native and restrained

The existing native page scroll and pull-to-refresh behavior remains. Interactive surfaces use only short opacity/color feedback and subtle `0.98` press scale where platform behavior permits. Empty-state art does not float, bounce, rotate, or loop.

### Verification combines source contracts and rendered evidence

Unit and build-facing tests protect copy, page hierarchy, asset references, and existing data orchestration. A local H5 visual harness renders representative child, adult, and no-avatar fixture states at 320px, 375px, and 430px for screenshot inspection. The WeChat build remains the authoritative platform compile check, while final device gesture verification remains a release check.

## Risks / Trade-offs

- [Generated still-life art may remain too decorative] → Enforce a small rendered size, one-object composition, transparent background, neutral palette, and visual inspection before integration.
- [Removing English labels may reduce perceived visual rhythm] → Replace decorative labels with spacing, rule lines, numeric hierarchy, and concise Chinese metadata.
- [Muted colors may weaken points affordance] → Reserve muted gold for point totals and institutional red for direct actions while keeping success states explicit in text.
- [Real reward photography may be inconsistent] → Preserve stable aspect ratios, neutral surfaces, and deterministic missing/error fallbacks.
- [H5 differs from WeChat rendering] → Use H5 for responsive composition evidence and retain WeChat production build plus device review as platform evidence.

## Migration Plan

1. Introduce the revised tokens and Chinese-first copy contract without changing page APIs.
2. Replace empty-state and icon assets, then update their shared components and references.
3. Rework activity, points, profile, and userinfo hierarchy and responsive styles.
4. Update secondary list/detail pages so shared states and hero treatment remain coherent.
5. Add multi-identity visual fixtures and responsive screenshot checks, then run unit tests, WeChat build, build-facing E2E, size checks, and strict OpenSpec validation.
6. Roll back by reverting the Taro submodule and root OpenSpec changes; no data migration is required.

## Open Questions

- Production activity and reward photography quality remains a content-management concern and is not generated by this change.
