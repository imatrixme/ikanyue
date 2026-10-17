## ADDED Requirements

### Requirement: Exact original visual tokens
The miniapp SHALL use the first-version Nintendo-inspired token values, including pure red `#e60012`, white surfaces, charcoal text, neutral canvas, compact radii, visible borders, and restrained semantic blue, yellow, green, and danger colors.

#### Scenario: Shared token inspection
- **WHEN** the shared miniapp style tokens are inspected
- **THEN** the original color, radius, border, and shadow values are present without mature-palette substitutions

### Requirement: Compact hardware-interface composition
The activity, points, profile, profile-editing, points-history, reward-catalog, and activity-detail surfaces SHALL use compact, content-led layouts with clear borders, small radii, stable controls, and direct typographic hierarchy.

#### Scenario: User opens a primary tab
- **WHEN** a user opens Activity, Points, or Profile
- **THEN** the page presents a compact original-style hierarchy without oversized marketing composition

#### Scenario: User opens a secondary list or detail page
- **WHEN** a user opens points history, the reward catalog, profile editing, or an activity detail
- **THEN** the page remains visually consistent with the same token and component language

### Requirement: Restrained visual assets
The miniapp SHALL use real activity and reward imagery when available, and SHALL NOT depend on decorative textures or oversized editorial empty-state illustrations for its core presentation.

#### Scenario: Content image is available
- **WHEN** an activity or reward includes a valid image
- **THEN** the miniapp presents that content image within the compact layout

#### Scenario: Content image is unavailable
- **WHEN** an activity, reward, avatar, or empty state lacks an image
- **THEN** the miniapp presents a restrained color or typographic fallback without a large decorative illustration

### Requirement: Functional behavior preservation
The visual restoration SHALL preserve current APIs, routes, activity loading, recent point-event summaries, complete point-history pagination, reward eligibility, complete reward catalogs, profile editing, logout placement, pull-to-refresh, and applicable incremental loading.

#### Scenario: User refreshes a data-backed page
- **WHEN** a user performs pull-to-refresh on a page that loads data on entry
- **THEN** the page reloads its current data without navigation or API contract changes

#### Scenario: User reviews complete points data
- **WHEN** a user leaves the two-item points summary for the complete history or reward catalog
- **THEN** the existing complete-list, refresh, and pagination behavior remains available

#### Scenario: User edits or exits the account
- **WHEN** a user enters profile editing
- **THEN** existing profile-editing controls remain available and logout remains inside that page rather than the Profile overview

### Requirement: Authored compact icon system
The miniapp SHALL use small locally authored navigation and command icons that fit the restored visual system and SHALL NOT copy Nintendo-owned artwork.

#### Scenario: Tab bar is rendered
- **WHEN** the miniapp tab bar is displayed
- **THEN** Activity, Points, and Profile use distinct compact icons with pure-red selected states and neutral inactive states

### Requirement: Restored visual regression evidence
The project SHALL include focused build, structural, and deterministic visual evidence for the restored visual system at representative narrow, standard, and wide phone widths.

#### Scenario: Restoration is verified
- **WHEN** the focused verification suite is run
- **THEN** exact tokens, preserved functional surfaces, rejected-asset absence, successful WeChat build, and stable screenshots at 320, 375, and 430 px are checked
