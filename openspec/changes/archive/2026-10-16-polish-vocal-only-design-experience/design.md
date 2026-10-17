## Context

Kanyue already has a cross-platform token source at `design-system/brand-tokens.json`, generated mini-program and website outputs, and a guard that rejects common raw brand values. The remaining mini-program drift is subtler: rich-text HTML injects raw type and spacing values, a few platform components keep token-worthy visual values inline, and current checks do not inspect those paths. The website is visually coherent at a layout level, but its domain model, copy, SEO, images, and several interaction messages still describe a general instrument school or a non-production preview.

The work spans the dependency-neutral parent repository plus two independent submodules. Existing local mini-program configuration and request-layer changes must remain untouched. Docker is excluded from iterative verification.

## Goals / Non-Goals

**Goals:**

- Make the shipped mini-program surfaces demonstrably conform to the generated token system.
- Add focused regression checks for the specific token bypasses found during the audit.
- Reframe the entire public website as a vocal academy for children, teenagers, adults, and mature learners.
- Replace instrument-led and generic visuals with a coherent, high-quality generated image family.
- Remove preview-mode, placeholder, fabricated-credential, and fabricated-testimonial language.
- Preserve the established Kanyue green editorial composition while refining typography, image crops, and responsive hierarchy.

**Non-Goals:**

- Changing API contracts, PocketBase collections, Admin workflows, authentication, rewards, or points behavior.
- Adding an online enrollment backend, payment, CRM, or email delivery service.
- Rebranding the existing color palette or introducing a second design system.
- Rewriting the website framework, adding a root workspace, or validating with Docker during implementation.

## Decisions

### 1. Keep the root token file as the only cross-platform visual source

Generated mini-program and website token outputs remain committed and are regenerated from the parent script. Local layout geometry may remain page-specific when it expresses content structure, but color, typography, repeated spacing, radii, shadows, motion, and control dimensions must use generated roles.

Alternative considered: create a website-only theme file. Rejected because it would recreate the drift the shared token source is intended to prevent.

### 2. Treat rich-text inline styles as generated token consumers

WeChat rich text does not reliably inherit all page selectors, so activity HTML may continue to use inline styles. The inline style strings will be emitted from generated theme values and consumed through a dedicated rich-text style contract instead of embedding raw values in the sanitizer.

Alternative considered: rely only on CSS classes inside `rich-text`. Rejected because platform behavior is less predictable and would weaken compiled-build evidence.

### 3. Separate semantic token violations from legitimate local geometry

The audit and guard will reject raw colors, font sizes, weights, line heights, radii, shadows, and repeated design-system dimensions in product code. Intrinsic geometry such as `50%` circles, viewport sizing, image aspect ratios, and layout-specific media dimensions may remain local when they are not shared visual semantics.

Alternative considered: prohibit every numeric CSS value. Rejected because it would force meaningless tokens and obscure the actual design contract.

### 4. Replace the website instrument model with vocal learning stages

The `Course.instrument` field becomes a vocal focus/track label. Course data covers early-childhood voice discovery, school-age foundations, teenage stage expression, adult voice development, mature voice care, and age-grouped ensemble work. Navigation, structured data, activity fallback data, stories, and teacher-team content use the same domain language.

Alternative considered: keep generic music content and only replace images. Rejected because the user's positioning requirement is semantic, not decorative.

### 5. Avoid invented people and testimonials

The faculty page will describe teaching roles and working methods rather than publishing generated portraits as real named teachers. The stories route will present clearly labelled representative learning paths rather than fabricated first-person endorsements.

Alternative considered: retain fictional names and quotes for visual completeness. Rejected because production copy must not imply unsupported identities or endorsements.

### 6. Use one generated editorial-photography art direction

All website raster assets will be generated as natural editorial photographs with restrained Kanyue green accents, warm neutral rooms, realistic skin texture, clear human interaction, no logos, and no embedded text. Voice remains the primary subject, while piano, music stands, vocal scores, microphones, and choral materials may appear when they clearly support sight-singing, ear training, rehearsal, or stage practice. The set will include wide hero, child, school-age sight-singing, teen, adult, mature learner, ensemble, coaching, and stage scenes. Final assets are committed as optimized WebP files with meaningful alt text.

Alternative considered: mix stock-style photos, illustration, and abstract textures. Rejected because mixed media would create aesthetic drift and weaken trust.

### 7. Make consultation truthful without inventing contact details

The contact page will remove the non-functional form and preview disclaimers. It will provide a concrete WeChat search workflow for “看乐艺术”, a copy-to-clipboard action, preparation guidance, and a transparent three-step consultation process. No unverified phone number, address, teacher identity, or response-time promise will be introduced.

Alternative considered: add a fake form success state or hard-code unknown contact details. Rejected because both are misleading.

### 8. Verify rendered typography and imagery, not only source scans

Verification combines source guards, unit tests, production builds, Playwright desktop/mobile screenshots, accessibility checks, and WeChat DevTools page screenshots. Image dimensions and references are checked so deleted instrument assets cannot remain silently reachable.

## Risks / Trade-offs

- [Generated people may appear too polished or synthetic] -> Use documentary prompts, natural poses, restrained retouching, and visual inspection before committing.
- [Vocal-only fallback activities can diverge from live API data] -> Keep fallback data vocal-only and document that live content is API-owned; do not rewrite backend content in this change.
- [WeChat rich-text support differs from browser CSS] -> Keep inline styles, but generate them from token values and verify the compiled page in DevTools.
- [Removing fictional names reduces conventional faculty-page familiarity] -> Replace biographies with clear teaching roles, methods, and accountability standards.
- [Clipboard access can fail in restrictive browsers] -> Provide visible search text and an explicit success/fallback message.
- [Broad visual cleanup can expand into unrelated product changes] -> Limit mini-program changes to visual conformance and website changes to content, imagery, typography, and truthful consultation UX.

## Migration Plan

1. Add the focused token and content guards before broad page edits.
2. Normalize mini-program rich text and shared visual bypasses, then rebuild and inspect core pages.
3. Replace website data and page copy, then update components and styles to the new content shape.
4. Generate, inspect, optimize, and reference the new image family; remove obsolete instrument assets only after references are gone.
5. Run subproject tests and builds, capture desktop/mobile and WeChat DevTools evidence, then commit each subproject and the parent pointers independently.
6. Rollback is commit-based per submodule; no data migration is required.

## Open Questions

None blocking. Live teacher identities, exact studio address, and direct inquiry endpoints remain content-operations inputs and are intentionally not fabricated in this change.
