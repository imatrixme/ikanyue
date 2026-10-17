## 1. Change Setup and Boundaries

- [x] 1.1 Create `feature/unified-design-platform` branches in the parent, mini program, and Admin repositories without discarding existing worktree changes
- [x] 1.2 Record the current lightweight Admin business scope and the legacy `ops-admin-system` specification drift in implementation evidence
- [x] 1.3 Verify the parent remains free of root package metadata, lockfiles, and workspace configuration

## 2. Token V2 Architecture

- [x] 2.1 Refactor `brand-tokens.json` into validated foundation, semantic, component, and music-ticket pattern layers
- [x] 2.2 Extend the root token generator with schema/key validation and deterministic Taro SCSS/ESM, Admin CSS/TypeScript, and Website CSS/TypeScript outputs
- [x] 2.3 Add or update token drift tests that reject stale generated files and raw brand values in product source components
- [x] 2.4 Regenerate Taro and Admin outputs and update the design-system map with source/output ownership and check commands

## 3. Website Art Direction Gate

- [x] 3.1 Create an ignored high-fidelity website design-artifact directory with a candidate rubric and stable file naming
- [x] 3.2 Generate at least four distinct desktop/mobile official website candidate boards using the image generation tool
- [x] 3.3 Inspect and score every candidate for brand fit, age inclusivity, hierarchy, feasibility, responsiveness, accessibility, and distinctiveness
- [x] 3.4 Select the strongest direction and record its reusable layout, imagery, typography, component, and motion decisions before coding the website

## 4. Mini Program Component System

- [x] 4.1 Add token-driven `PageChrome`, `PageHeader`, and `SectionHeader` components and migrate repeated page chrome
- [x] 4.2 Add reusable `FormRow`, `SegmentedControl`, and `StickyActionBar` components and migrate profile editing surfaces
- [x] 4.3 Add reusable `AsyncState`, `MediaThumb`, and `PaginationState` components and migrate list/loading/error/empty states without replacing existing empty-state artwork
- [x] 4.4 Normalize existing ticket, pass, voucher, section, and account-row components against Token V2 variants and accessibility contracts
- [x] 4.5 Add focused component tests and rerun mini program unit, production build, build-facing E2E, and style checks

## 5. Admin Primitive and Layout System

- [x] 5.1 Add token-driven page header, section header, summary band, toolbar, and responsive workspace layout components
- [x] 5.2 Complete command and form primitives for icon buttons, tooltips, form fields, textarea, checkbox, switch, segmented control, and validation messaging
- [x] 5.3 Complete data and feedback primitives for tabs, alerts, toast, data table, pagination, empty state, skeleton, error state, and retry
- [x] 5.4 Complete overlay and media primitives for dialog, drawer, confirm dialog, file uploader, and image preview with focus restoration
- [x] 5.5 Add primitive-level tests for variants, keyboard behavior, focus handling, responsive reflow, and raw-token guards

## 6. Admin Workflow Migration

- [x] 6.1 Migrate login, registration, and forced-password-change views to the shared Admin components without changing authentication behavior
- [x] 6.2 Build student table, student detail drawer, and student editor domain components and migrate the student workspace
- [x] 6.3 Build point ledger table and point adjustment dialog domain components and migrate point lookup/grant workflows
- [x] 6.4 Build reward catalog table, reward editor drawer, upload preview, and redemption confirmation components and migrate reward workflows
- [x] 6.5 Remove remaining page-internal primary view switching and verify stable navigation, selection, overlay, loading, empty, error, success, disabled, and destructive states
- [x] 6.6 Run Admin lint, unit, SSR, production build, E2E, accessibility, and 768px-1440px visual checks

## 7. Official Website Project

- [x] 7.1 Scaffold `ikanyue.website` as an independent Nuxt 4 / Vue 3 / TypeScript / Tailwind 4 Git repository on `feature/unified-design-platform`
- [x] 7.2 Integrate generated Website tokens and build local UI, layout, navigation, media, form, activity-ticket, course, faculty, and async-state components from the selected direction
- [x] 7.3 Implement Home, Courses, Faculty, Student Stories, About, Contact, and Privacy routes with production-ready responsive content structure
- [x] 7.4 Implement Activities and Activity Detail routes against the existing public activity contract with loading, empty, error, and media fallbacks
- [x] 7.5 Add canonical metadata, sitemap, robots, Open Graph, and Organization, Course, and MusicEvent structured data
- [x] 7.6 Add unit, type, production build, browser E2E, accessibility, responsive visual, and Lighthouse checks with all category targets at or above 90
- [x] 7.7 Register the website as a parent submodule after a durable remote repository URL is available, without introducing root dependencies

## 8. Cross-Product Verification and Closure

- [x] 8.1 Run the root token generation check and strict OpenSpec validation
- [x] 8.2 Compare representative mini program, Admin, and Website screenshots for token, component-state, and music-ticket pattern consistency
- [x] 8.3 Verify no Flutter, legacy activity-site, backend schema, private API, or production configuration changes entered the implementation
- [x] 8.4 Document remaining production content inputs and defer Docker/1Panel validation until the explicit release gate
