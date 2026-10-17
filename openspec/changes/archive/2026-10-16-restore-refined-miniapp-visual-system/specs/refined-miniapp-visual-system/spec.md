## ADDED Requirements

### Requirement: Restored semantic visual system
The mini program SHALL use one coherent high-contrast token system in which red, blue, yellow, green, ink, warm-white surfaces, spacing, radii, shadows, typography, and motion have stable semantic roles across registered pages.

#### Scenario: Shared hierarchy across pages
- **WHEN** a learner opens activity, points, profile, profile editing, detail, history, or reward catalog pages
- **THEN** heroes, section headings, cards, controls, progress, and states use the same token roles and component hierarchy

#### Scenario: Adult learner presentation
- **WHEN** an adult learner with a long display name opens the mini program
- **THEN** the interface remains professional, readable, and free of child-specific characters or labels

### Requirement: Original age-neutral music artwork
The mini program SHALL provide normalized transparent artwork for account, activity, reward, points, image, and network states using original music-school objects, controlled color blocks, consistent perspective, and a common optical scale.

#### Scenario: Missing or empty content
- **WHEN** a page has no account, activities, rewards, points events, image, or network result to display
- **THEN** it renders the matching compact age-neutral asset without a face, mascot, age marker, copied character, or oversized decorative frame

#### Scenario: Real media is available
- **WHEN** an activity cover, learner avatar, or managed reward image is available
- **THEN** the real media remains the primary visual and generated artwork is not shown in its place

### Requirement: Restrained surface texture
The mini program SHALL limit decorative texture to reusable low-opacity paper, staff-line, or halftone layers on hero or empty-state backing surfaces while keeping data cards and text surfaces clean.

#### Scenario: Textured hero
- **WHEN** a page renders a red hero region
- **THEN** at most one subtle texture layer may appear and text retains its required contrast without relying on the texture

#### Scenario: Data surface
- **WHEN** a card contains activity, points, reward, event, or profile data
- **THEN** the card does not receive a decorative texture layer

### Requirement: Behavior-preserving page redesign
The mini program SHALL preserve existing Chinese-first copy, navigation, authentication, data loading, retry, pull-to-refresh, pagination, profile editing, recent-item limits, and real-media behavior while changing presentation.

#### Scenario: Refreshable page
- **WHEN** the learner pulls down on a page that loads data on entry
- **THEN** the page refreshes through the existing data path and retains the restored visual hierarchy

#### Scenario: Paginated list
- **WHEN** the learner scrolls to the end of points history or reward catalog
- **THEN** the page loads the next page through the existing pagination path without changing the displayed ordering contract

### Requirement: Responsive and age-inclusive visual evidence
The mini program SHALL provide rendered visual evidence for child, adult, and no-avatar identities at 320px, 375px, and 430px viewport widths.

#### Scenario: Fixture screenshot matrix
- **WHEN** the visual verification workflow runs
- **THEN** it captures all nine identity and width combinations and exposes profile, points, activity, and empty-state composition for inspection

#### Scenario: Responsive quality gate
- **WHEN** the screenshots are reviewed
- **THEN** no required text, icon, image, control, card, or hero content is clipped, overlapped, or hidden and decorative texture remains subordinate to content
