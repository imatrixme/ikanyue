## Mini-program token audit

Audited shipped pages: activity, activity detail, points, points history, reward catalog, profile, user info, image detail, and webview. Audited shared components: account row, activity ticket, app icon, async/empty/pagination states, form row, media thumb, page chrome/header, point event row, points pass, reward voucher, section header, segmented control, sticky action bar, and ticket section.

Semantic violations found and fixed:

- Activity rich-text headings, paragraphs, lists, images, and links embedded raw font, spacing, radius, weight, and color values in JavaScript.
- Profile login popup embedded a raw `8px` radius in a template style object.
- App icon sizes were distributed as page-local values from 13px to 42px instead of using named component roles.
- The parent token check scanned raw brand colors but did not reject raw typography or radius values in JavaScript and Vue templates.

Reviewed and retained as legitimate local geometry:

- `50%` circles and circular loaders.
- `100vh` / `100vw` viewport ownership.
- Content-specific ticket rails, image dimensions, barcode lines, and responsive media widths.
- Zero font size used to suppress glyph space in a decorative point-event marker.

Evidence:

- Root design check passes after scanning product source for raw brand, typography, and radius values.
- Mini-program unit tests pass with 50 tests.
- WeChat production build succeeds; known pre-existing CSS order and Browserslist freshness warnings remain.
- Build-facing mini-program E2E confirms generated rich-text styles, named icon sizes, immersive page chrome, and compiled page contracts.
- WeChat DevTools skill `0.2.7` matched the installed DevTools skill and the logged-in simulator opened the production build with AppID `wx9cd85dbfdf22c771`.
- Visual evidence captured at `/tmp/kanyue-mini-profile-audit.png`, `/tmp/kanyue-mini-userinfo-audit.png`, `/tmp/kanyue-mini-points-audit.png`, `/tmp/kanyue-mini-activity-audit.png`, and `/tmp/kanyue-mini-activity-detail-audit.png` shows coherent chrome, tokenized controls, named icon sizing, empty states, and error states without clipping or overlap.
- The legacy 680px empty-state illustrations were restored as the component's primary visual, recolored from generated semantic tokens by `scripts/recolor-empty-illustrations.py`, and verified in WeChat DevTools at `/tmp/kanyue-mini-empty-state.png`.

## Website audit

Content and structure findings fixed:

- General music-school positioning was replaced with six age-specific vocal pathways spanning ages 4 through mature adulthood.
- Instrument-course data, named placeholder teachers, testimonial-style fictional learners, generic fallback events, and preview-mode consultation/privacy copy were removed.
- Teaching content now uses three role-based teams; the learning-path route explicitly presents representative stage models rather than endorsements.
- Consultation now provides a WeChat search/copy workflow and preparation checklist without pretending to submit or store personal data.
- Website typography and responsive composition use generated Kanyue tokens; the parent guard now scans website CSS and mini-program shared styles.

Image generation status:

- Built-in imagegen produced and visually reviewed a coherent editorial set for multigenerational hero, early-childhood, school-age sight-singing, teen, adult, mature, ensemble, and stage scenes.
- At the user's direction, the school-age and ensemble scenes permit pedagogically appropriate piano, vocal scores, and music stands while keeping voice as the primary subject.
- The built-in tool stored image data in the session's structured `image_generation_call.result` payloads even though the client did not mirror them into `$CODEX_HOME/generated_images`; those built-in results were decoded locally without an API or CLI image-generation fallback.
- Eight selected images were optimized to WebP at 52-131 KB each and stored under `ikanyue.website/public/images/vocal-*.webp`. The six obsolete instrument-course assets were removed, and content checks confirm every website image is referenced and present.

Website verification:

- `npm run lint`, `npm test`, `npm run test:content`, and `npm run build` pass.
- Playwright runs 22 desktop/mobile route, overflow, workflow, and Axe checks with no critical or serious accessibility violations.
- Full-page desktop and mobile screenshots are stored in Playwright test results; the inspected tablet screenshot is `/tmp/kanyue-website-tablet.png`.
- The desktop, tablet, and mobile captures show stable typography, intentional image crops, vocal-first subject matter, visible age diversity, and no incoherent overlap.
