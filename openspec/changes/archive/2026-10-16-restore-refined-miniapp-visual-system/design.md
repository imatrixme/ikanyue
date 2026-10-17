## Context

The Taro mini program now contains the complete lightweight points experience: activity discovery and details, points balance and recent events, reward catalog and history, profile and profile editing, native refresh, pagination, and resilient data states. The most recent design pass made those pages age-neutral by replacing the saturated interface with an institutional palette and very quiet still-life art. That pass preserved behavior but also removed the stronger section rhythm, semantic color cues, and compact visual hierarchy that made the earlier version feel polished.

This change is presentation-only and remains inside `ikanyue.taro3`. Existing page logic, API contracts, authentication, navigation, refresh, pagination, and backend authority remain unchanged. The visual result must support children, parents, and adult learners without introducing separate themes or child-coded characters.

## Goals / Non-Goals

**Goals:**
- Recover a coherent, energetic visual system built from red, blue, yellow, ink, and warm white without copying branded characters or protected artwork.
- Restore compact hero, card, menu, progress, and icon-block patterns across every registered page.
- Keep Chinese-first utility copy and real activity, avatar, and reward media as primary content.
- Produce a consistent set of age-neutral music editorial assets and subtle reusable surface textures.
- Protect responsive composition at 320px, 375px, and 430px for child, adult, and no-avatar fixtures.
- Keep generated assets deterministic enough to be inspected, regenerated, and referenced without runtime dependencies.

**Non-Goals:**
- No API, schema, authentication, points, reward, inventory, shipping, or redemption behavior changes.
- No Admin or Hono changes.
- No copied game characters, logos, scenes, or trademarked visual assets.
- No per-age theme switch, custom font download, runtime icon library, gradient, animated decoration, or Docker verification.

## Decisions

### Restore the visual grammar, not an old source snapshot

The implementation will preserve the current Vue structure and completed behaviors, then restyle them through shared tokens and local page styles. It will use the committed points-lite experience and the current fixture as evidence for hierarchy, but it will not reset the Taro worktree to an earlier commit because several current pages and flows are uncommitted additions.

Alternative considered:
- Reset the submodule and replay later features: rejected because it risks losing profile editing, activity pages, pagination, and refresh work that is already correct.

### Use a five-color semantic system

The shared palette uses vivid academy red for heroes and direct actions, clear blue for information and identity, warm yellow for points and progress, green only for confirmed availability, deep ink for structure, and warm white for surfaces. The system restores crisp 8px-or-smaller card radii, visible borders, compact shadows, and stable 4/8px spacing increments.

Color is assigned by meaning rather than page. Every page receives at least one secondary semantic color beyond red so the interface does not collapse into a one-hue theme.

Alternative considered:
- Keep the muted institutional token file and only replace images: rejected because artwork cannot repair weak hierarchy or indistinct interactive grouping.

### Preserve layout structure while restoring stronger hierarchy

Red hero regions remain full-bleed and overscroll-safe, but recover a stronger title, supporting metadata, and selective geometric texture. Section headings use small color markers or icon blocks rather than decorative English eyebrows. Cards remain compact and scannable; details and actions remain subordinate to primary content.

No page receives a marketing hero, nested card stack, or oversized illustration. The activity page remains content-first, the points page remains balance-and-reward-first, and the profile page remains identity-and-settings-first.

### Artwork uses one original editorial kit

Six transparent PNG assets cover account, activity, reward, points, image, and network states. They use music-school objects, simplified perspective, solid color blocks, dark outlines, minimal halftone, and a consistent optical box. No faces, mascots, child proportions, age markers, text, 3D clay rendering, or copied game motifs are allowed.

Representative art direction is validated first through account, activity, and reward assets; the remaining assets must follow the accepted geometry and palette. Real activity photos and managed reward photos always take precedence over generated art.

### Texture is a supporting token

Reusable transparent raster textures provide paper grain, sparse staff lines, and sparse halftone. Texture opacity is limited in CSS and applied only to red heroes or empty-state visual backing. Cards and data surfaces remain clean. A surface can use at most one texture layer, and text contrast must not depend on the texture.

### Verification uses both contracts and rendered evidence

Source-level tests protect token names, asset references, hierarchy markers, page registration, and behavior-preserving copy. The visual fixture renders profile, points, activity, and empty states for child, adult, and no-avatar variants. Playwright screenshots at 320px, 375px, and 430px are inspected for clipping, hierarchy, color balance, age bias, and texture restraint. Unit tests, build-facing E2E, and the WeChat production build remain required.

## Risks / Trade-offs

- [The restored palette could again read as child-only] -> Keep people out of generated art, use real mixed-age photography, preserve Chinese-first copy, and validate an explicit adult fixture.
- [Texture can reduce legibility or look noisy] -> Cap opacity, keep textures away from text-heavy surfaces, and inspect every target width.
- [Generated assets can drift in perspective or scale] -> Use one optical-box contract, normalized transparent canvases, and a contact-sheet review before integration.
- [Restyling multiple pages can accidentally alter behavior] -> Keep Vue logic and API calls unchanged, use source-level navigation/data tests, and review the diff for presentation-only scope.
- [Native WeChat rendering differs from the H5 fixture] -> Treat the fixture as responsive evidence, then require a WeChat production build and retain real-device gesture review as release risk.

## Migration Plan

1. Capture the current fixture and derive the restored tokens and shared surface primitives.
2. Restyle primary pages, then secondary list/detail pages, without changing their state logic.
3. Produce and normalize the editorial asset and texture kit, then integrate it through existing fallbacks and empty-state components.
4. Update icon colors and visual fixtures, then run responsive screenshot inspection.
5. Run unit tests, build-facing E2E, WeChat build, asset-reference checks, file-length checks, and strict OpenSpec validation.
6. Roll back by reverting this Taro submodule change and the root OpenSpec change; no data migration is involved.

## Open Questions

None blocking. Production activity and reward photography remains content work managed outside this source change.
