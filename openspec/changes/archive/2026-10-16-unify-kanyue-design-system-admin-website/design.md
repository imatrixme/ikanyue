## Context

Kanyue currently has a root-owned `brand-tokens.json` and generator that emit a small SCSS theme for the Taro mini program and CSS variables for the React Admin. The selected mini program redesign has begun to establish a green music-ticket language and a handful of reusable Vue components, while the lightweight Admin already has local UI primitives but still mixes page layout, workflow state, and styling. The planned official website does not yet exist.

The parent repository is a dependency-neutral submodule coordinator. Each frontend must retain its own package metadata, lockfile, tests, and release lifecycle. Runtime components cannot be shared safely across Taro/Vue, React, and Nuxt/Vue, but token data, visual contracts, icons, and approved imagery can be shared as generated artifacts. Docker is reserved for final release verification.

The current main `ops-admin-system` specification describes the older broad teaching-operations product, while the active Admin hard fork intentionally contains only authentication, student management, point operations, and reward catalog/redemption. This change treats the current hard-fork code and README as the business-scope authority and changes presentation only.

## Goals / Non-Goals

**Goals:**
- Establish a versioned Token V2 source that is expressive enough for three products without embedding framework-specific implementation.
- Generate deterministic, committed platform outputs that let every subproject build independently.
- Turn repeated mini program structures into tested components while preserving page behavior and native WeChat interactions.
- Give every current Admin surface a coherent operations-oriented information architecture and reusable primitive/domain components.
- Create a separate official website whose visual direction is chosen from generated high-fidelity candidates before code implementation.
- Preserve accessible focus, loading, empty, error, disabled, destructive, and responsive states across platforms.
- Keep all development on `feature/unified-design-platform` branches and preserve the parent repository's no-workspace boundary.

**Non-Goals:**
- No restoration of removed teaching, reporting, shipping, refund, or resource-management modules in the lightweight Admin.
- No new points, reward, authentication, PocketBase, MinIO, or `/ops/*` business contract in the initial implementation.
- No direct sharing of Vue or React runtime components across projects.
- No replacement of the existing mini program empty-state artwork in this change.
- No redesign of the Flutter app or legacy activity website.
- No Docker validation before the final release gate.

## Decisions

### Token V2 uses foundation, semantic, component, and pattern layers

`design-system/brand-tokens.json` remains the source of truth and is expanded into four layers:

- Foundation: raw color, typography, spacing, radius, shadow, motion, breakpoint, z-index, container, and density scales.
- Semantic: canvas, surface, text, border, action, feedback, focus, and data-status roles.
- Component: control heights, icon sizes, table density, dialog/drawer sizing, navigation geometry, form-row spacing, and interaction states.
- Pattern: music-ticket perforation/rule treatments, event date rail, pass/voucher hierarchy, and restrained public-site editorial accents.

The generator validates required keys and emits committed SCSS/ESM for Taro plus CSS/TypeScript outputs for Admin and Website. Generated files are never hand-edited. A check mode fails when outputs drift.

Alternative considered: share a CSS package at runtime. Rejected because Taro, Vite, and Nuxt have different build/runtime constraints and independent releases must not depend on a root workspace package.

### Visual contracts are shared; components remain platform-native

Component names, anatomy, variants, states, and accessibility expectations are documented in token data and OpenSpec, but implementation stays local:

- Taro/Vue: `src/components` primitives and music-ticket patterns.
- Admin/React: `src/components/ui`, `src/components/layout`, and `src/components/ops` domain components.
- Website/Nuxt: `app/components/ui`, `app/components/layout`, and `app/components/sections`.

Alternative considered: framework-agnostic web components. Rejected because they complicate Taro compilation, SSR/hydration, styling, and form semantics without reducing meaningful duplication.

### Mini program refactoring follows repeated page anatomy

The current ticket/pass/voucher components remain, and repeated structures become `PageChrome`, `PageHeader`, `FormRow`, `SegmentedControl`, `StickyActionBar`, `AsyncState`, `MediaThumb`, `PaginationState`, and `SectionHeader`. Pages retain ownership of fetching and business decisions; components receive explicit props and emit user intents.

Alternative considered: one configurable page renderer. Rejected because activity, points, profile, and account editing have materially different behavior and a schema-driven renderer would hide page semantics.

### Admin uses an operations workspace, not page-internal view switching

Every current module uses a stable structure: `PageHeader`, optional `SummaryBand`, `FilterToolbar`, data table/list, `DetailDrawer`, and focused action dialog. URL/module navigation chooses the primary workspace; internal state is limited to filters, selection, dialogs, and drawers. Reusable primitives cover buttons, icon buttons, form fields, inputs, selects, switches, segmented controls, tabs, badges, alerts, toast, tables, pagination, dialogs, drawers, empty/error/loading states, file upload, and image preview. Domain components compose these for students, point ledger/adjustment, reward catalog/editing, and redemption confirmation.

Alternative considered: keep each workflow as a bespoke panel with conditional views. Rejected because it produces focus loss, inconsistent responsive behavior, and duplicated state handling.

### Website visual selection is an explicit pre-code gate

At least four desktop/mobile candidate boards are generated with the image generation tool. All candidates use the shared green brand, music-ticket motifs, real music-education subject matter, age-inclusive imagery, and the required page hierarchy, but vary composition and editorial rhythm. Candidates are stored in an ignored design-artifact directory and evaluated against a written rubric: brand fit, age inclusivity, content clarity, implementation realism, responsive adaptability, accessibility, and distinctiveness. The highest-scoring direction is recorded in `ikanyue.website/docs/design-direction.md` before page implementation.

Alternative considered: implement several coded prototypes. Rejected because it multiplies frontend work before visual direction is settled and encourages accidental convergence on framework defaults.

### The official website is an independent Nuxt project

`ikanyue.website` uses Nuxt 4, Vue 3, TypeScript, and Tailwind 4 with its own dependencies and lockfile. It provides Home, Courses, Faculty, Activities, Activity Detail, Student Stories, About, Contact, and Privacy pages. Static institutional pages are prerendered; activity content uses SSR or stale-while-revalidate against existing public APIs. SEO includes canonical metadata, sitemap, robots, Open Graph, and structured data for the organization, courses, and music events.

The project is created as an independent local Git repository on `feature/unified-design-platform`. It is registered in the parent as a submodule only after a durable remote repository URL exists; the parent must not record a broken local-only submodule URL.

Alternative considered: convert `ikanyue.m.nuxt`. Rejected because that project is the existing activity site and the user requested a new official website with an independent migration and rollback path.

### Verification is local and layered

Token generation/checks run from the root. Each subproject runs its own lint/typecheck, unit tests, production build, and focused browser or WeChat visual checks. Responsive screenshots cover 320, 375, 768, 1280, and 1440 widths where applicable. Docker is used only at the final release gate.

## Risks / Trade-offs

- [Token V2 grows into an unstructured value dump] -> Enforce layer ownership, schema validation, semantic naming, and prohibit page-specific tokens unless a repeated pattern exists.
- [Cross-platform outputs render differently] -> Define visual anatomy and state contracts, then verify representative fixtures per platform instead of assuming identical pixels.
- [Mini program refactoring regresses data flows] -> Keep fetching in pages, migrate one repeated anatomy at a time, and retain current unit/build/E2E checks.
- [Admin migration changes business behavior] -> Treat API calls and workflow tests as invariants; separate visual primitives from domain operations.
- [Generated website mockups contain illegible or impossible UI] -> Use them as art-direction references, not implementation source; score feasibility and rebuild all text/UI with semantic HTML.
- [Website imagery reads as children-only or generic stock] -> Require child and adult representation, real instruments/learning spaces, restrained decoration, and editorial cropping in the selection rubric.
- [New website cannot be registered as a submodule immediately] -> Keep it as an independent local repository until the remote exists; document the exact registration step and do not weaken the parent boundary.
- [Legacy activity site and new website overlap] -> Keep `ikanyue.m.nuxt` unchanged until an explicit cutover plan is approved.

## Migration Plan

1. Create dedicated branches in the parent, Taro, and Admin repositories; create the Website repository on the same branch name.
2. Complete OpenSpec artifacts and strict validation.
3. Expand Token V2 and generator validation, then regenerate all existing platform outputs.
4. Generate at least four website candidates, score them, and record the selected direction.
5. Expand the mini program component library and migrate repeated structures without changing data behavior.
6. Build Admin primitives and domain components, then migrate authentication, students, points, rewards, and redemption surfaces.
7. Scaffold and implement the Website from the selected direction, including content routes, SEO, responsive behavior, and public activity integration.
8. Run per-project unit, type, build, E2E, accessibility, and visual verification. Perform Docker/release validation only when publication is requested.

Rollback is project-local: each subproject branch can be reverted independently. Token outputs are deterministic and can be regenerated from the previous source. No data migration is introduced.

## Open Questions

- The durable Git remote and production domain for `ikanyue.website` must be supplied or created before parent submodule registration and deployment configuration.
- Final production photography and faculty/course copy remain content inputs; implementation uses clearly marked local fixtures until approved content exists.
