## Implementation Evidence

### Branch and repository boundaries

- Parent, `ikanyue.taro3`, and `ikanyue.admin` use `feature/unified-design-platform`.
- `ikanyue.website` is an independent local Git repository on the same branch.
- The parent has no root package manifest, lockfile, workspace file, or task runner configuration.
- Mini program commit `3168c95` is available on the remote `feature/unified-design-platform` branch; local IDE configuration and unrelated profile-request edits remain outside that commit.
- Admin commit `11063d0` exists locally on `feature/unified-design-platform`; the historical `imatrixme/ikanyue.admin` remote is currently unavailable to the authenticated account, so its parent gitlink was not advanced.
- The private `imatrixme/ikanyue.website` remote contains commit `5dee030` on `feature/unified-design-platform`.
- The parent registers `ikanyue.website` as a branch-tracking submodule using the existing SSH URL convention.

### Implemented surfaces

- Token V2 now owns foundation, semantic, component, and pattern values and generates typed/CSS outputs for all three products.
- The mini program uses shared page chrome, headers, form rows, segmented controls, sticky actions, media, async, pagination, ticket, pass, voucher, section, and account-row components.
- Admin uses shared workspace headers, summary bands, toolbars, responsive data regions, controls, feedback states, tables, overlays, upload/media primitives, and focus restoration.
- Admin keeps the hard-fork business boundary: authentication, student management, point operations, reward catalog, and offline redemption only.
- The website implements the selected Ticket Archive direction with a production Nuxt route structure, public activity integration, SEO metadata, structured data, accessibility, responsive behavior, and Lighthouse gates.

### Verification evidence

- Root token drift and raw-value guard: passed.
- Mini program: 49 unit tests, WeChat production build, style fixture, and build-facing E2E passed.
- Admin: lint, 56 unit tests, SSR/production build, 27 Playwright cases at 1440px, 768px, and mobile, Axe serious/critical checks, and screenshot inspection passed.
- Admin dependency audit: passed with zero known vulnerabilities after the non-breaking audit update.
- Website: lint, 3 unit tests, production build, 20 desktop/mobile Playwright cases with Axe checks, and Lighthouse assertions passed.
- Admin screenshot inspection covered the points workspace at 1440px, 768px, and mobile plus the student detail drawer.

### Scope exclusion evidence

- No Flutter source was changed.
- No legacy activity-site source was changed.
- No backend schema or endpoint contract was changed.
- No private API or production deployment configuration was changed.
- No Docker or 1Panel validation was run; those remain release-gate activities.

### Remaining production inputs

- Confirm the production website origin and public activity API base URL.
- Replace provisional website contact details, staff biographies, course copy, and legal owner text with approved production content.
- Confirm final licensed photography before public launch.
- Review the five current Lighthouse CLI toolchain advisories before release; the automated fix requires a breaking LHCI downgrade and was not applied.
- Run Docker/1Panel validation only when the release candidate is explicitly approved.
