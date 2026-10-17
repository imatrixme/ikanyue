## Context

The miniapp's first Nintendo-inspired redesign established a coherent hardware-interface language: exact `#e60012` red, white surfaces, charcoal typography, compact radii, visible borders, and restrained blue/yellow/green functional accents. Later iterations added institutional textures, editorial illustrations, softer color drift, and more decorative composition. Those iterations changed presentation but also accumulated useful product behavior that must not be lost.

The authoritative restoration reference is the original first-version patch and captured profile-page screenshot. The current implementation remains the behavior authority for activity discovery, points events, reward eligibility, profile editing, refresh, pagination, and navigation.

## Goals / Non-Goals

**Goals:**

- Restore the first-version design tokens and compact composition across the current miniapp surface.
- Preserve every current business workflow and API contract.
- Remove rejected decorative assets and their build-time generation path when they have no remaining references.
- Keep the implementation maintainable by separating page-specific additions when restored first-version styles approach the project file-size limit.
- Verify the restored presentation structurally and visually at representative phone widths.

**Non-Goals:**

- Reverting source control history or deleting later functional work.
- Changing APIs, authentication, points accounting, reward redemption, or admin behavior.
- Reproducing Nintendo-owned icons, characters, sounds, or trademarked assets.
- Redesigning the desktop admin or backend services.

## Decisions

### Restore the original token values exactly

The shared token layer will return to pure red `#e60012`, charcoal `#242424`, canvas `#f4f4f2`, white surfaces, and compact 4/6/8 px radii. Functional blue, yellow, green, and danger colors remain available. Exact values are preferable to another approximation because token drift was a primary cause of the rejected visual result.

Alternative considered: tune the current mature palette. Rejected because the user explicitly selected the first visual system, not an adjusted derivative.

### Restore presentation while retaining current page behavior

Templates and styles will be reshaped to the original hierarchy, but current data hooks, navigation targets, refresh handlers, pagination, loading/error states, eligibility calculations, and profile actions remain intact.

Alternative considered: restore the original files wholesale. Rejected because that would silently remove later required functionality.

### Prefer typography, borders, color, and spacing over decorative imagery

Texture backgrounds, oversized empty-state illustrations, and decorative editorial assets will be removed from active UI. Real activity and reward images remain content, while missing-image states use restrained typographic placeholders.

Alternative considered: keep the new images but recolor them. Rejected because their scale and visual role, rather than color alone, conflict with the first design.

### Preserve compact custom iconography without copied brand assets

Navigation and command icons will remain simple, content-specific, and small. The implementation will use locally authored icons and text marks such as `PT`; it will not copy Nintendo artwork.

### Treat visual fixtures as regression evidence

The existing deterministic visual fixture will be restyled to the restored system and captured at 320, 375, and 430 px widths. Focused tests will assert token values, absence of rejected texture dependencies, preserved routes, and the retained functional states.

## Risks / Trade-offs

- [The original style files predate later page states] → Add narrowly scoped compatibility modules instead of weakening the restored base styles.
- [Removing illustration assets can leave stale imports] → Search structurally and textually for every asset/helper reference before deleting files.
- [A visual rollback can accidentally become a behavior rollback] → Keep page logic modules unchanged unless a test proves a presentation integration issue.
- [Device rendering can differ from H5 fixtures] → Run the WeChat production build and retain manual WeChat DevTools inspection as residual verification.
- [Pure red can dominate long pages] → Limit red to immersive headers, identity marks, and decisive actions; keep reading surfaces white or neutral.
