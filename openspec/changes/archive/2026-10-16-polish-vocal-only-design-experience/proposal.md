## Why

The shared Kanyue design system is present, but the mini program still contains local visual values and rich-text styling that can drift outside the token contract. The public website also mixes unfinished preview copy with instrument-led content and imagery, so it does not yet communicate a production-ready, vocal-only academy for learners of different ages.

## What Changes

- Audit every shipped mini-program page and shared component for color, typography, spacing, control, empty-state, and immersive-chrome drift.
- Replace avoidable one-off visual values with generated design tokens or explicit shared component contracts, and extend automated guards to catch the recurring drift patterns.
- Rewrite the public website around vocal education only, covering children, teenagers, adults, mature learners, ensemble work, stage expression, and vocal health.
- Remove piano, guitar, and generic instrument study as website offerings while allowing piano, music stands, scores, microphones, and choir materials when they clearly support vocal pedagogy.
- Replace generic or instrument-led website imagery with a coherent generated visual set that follows the Kanyue green editorial system, represents multiple learner age groups, and includes varied vocal training contexts.
- Refine website typography, line length, content hierarchy, responsive composition, image crops, and accessible interaction states without introducing a second visual language.
- Keep the parent repository dependency-neutral and keep all runtime changes inside the existing mini-program and website subprojects.

## Capabilities

### New Capabilities
- `miniapp-design-token-conformance`: Defines page-wide token usage, shared visual contracts, and regression evidence for the mini program.
- `vocal-website-production-experience`: Defines a production-grade vocal-only content, imagery, typography, and responsive experience for the public website.

### Modified Capabilities

None.

## Impact

- Parent design-system sources, generator checks, OpenSpec artifacts, and submodule pointers may change.
- `ikanyue.taro3` shared components, activity rich-text rendering, page styles, tests, compiled build, and WeChat DevTools evidence are affected.
- `ikanyue.website` content models, pages, SEO metadata, generated image assets, shared components, styles, tests, and Nuxt build output are affected.
- No backend API, Admin workflow, Docker deployment, production credentials, or root JavaScript workspace is added or changed.
