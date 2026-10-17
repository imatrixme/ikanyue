## ADDED Requirements

### Requirement: Age-inclusive visual foundation
The mini program SHALL use one restrained contemporary music-education visual foundation for child, parent, and adult learner accounts without age-specific theme switching.

#### Scenario: Adult learner opens a primary page
- **WHEN** an adult learner opens the activity, points, profile, or profile-editing page
- **THEN** the page uses warm neutral surfaces, deep text, restrained institutional red, muted semantic colors, and content-first hierarchy without child-only characters or toy-like decoration

#### Scenario: Child learner opens the same page
- **WHEN** a child learner opens the same primary page
- **THEN** the system presents the same clear hierarchy and preserves a warm music-school identity without requiring a separate child theme

### Requirement: Chinese-first product language
The mini program SHALL use direct Chinese for functional headings, actions, statuses, empty states, and account concepts, and SHALL limit English to a stable Kanyue brand signature.

#### Scenario: Functional state is displayed
- **WHEN** the mini program displays loading, empty, error, reward, points, or profile state copy
- **THEN** it does not use game-like English labels, player numbering, or decorative uppercase translations

#### Scenario: Learner identity is displayed
- **WHEN** the product describes account management
- **THEN** it uses natural labels such as personal information, learner profile, or points account and uses musician language only as optional brand identity expression

### Requirement: Compact age-neutral empty states
The mini program SHALL provide shared compact empty states for activity, network, points, rewards, image, and signed-out account contexts using age-neutral musical still-life artwork.

#### Scenario: Empty or error state is shown
- **WHEN** a supported page has no content, cannot load content, or requires login
- **THEN** it shows one small transparent illustration without people, faces, toy rendering, text, animation, or a decorative illustration frame

#### Scenario: Empty state includes recovery
- **WHEN** the user can resolve the empty or error state
- **THEN** the component presents one concise Chinese explanation and one unambiguous action without competing decoration

### Requirement: Content-first primary page hierarchy
The activity, points, profile, and profile-editing pages SHALL prioritize real activities, account value, reward availability, and learner identity over decorative graphics.

#### Scenario: Activity page has content
- **WHEN** activities are available
- **THEN** real cover media, activity name, date, location, and availability are visually stronger than the page hero or empty-state system

#### Scenario: Points page has content
- **WHEN** point and reward data is available
- **THEN** the current balance, immediately redeemable items, locked progress, and recent ledger events appear in that decision order

#### Scenario: Profile is authenticated
- **WHEN** a learner is logged in
- **THEN** the page presents avatar or initials, recognisable identity, points account, and personal information as a quiet settings hierarchy rather than a game character profile

### Requirement: Coherent icon system
The mini program SHALL use one coherent line-icon grammar for the three tab-bar destinations and shared functional actions.

#### Scenario: Tab bar is rendered
- **WHEN** the native tab bar displays activity, points, and profile destinations
- **THEN** all three icons share the same optical grid, stroke weight, rounded geometry, neutral default state, and institutional-red selected state

#### Scenario: Functional icon is rendered
- **WHEN** a shared action icon appears on a page
- **THEN** it follows the same line grammar and uses semantic color only when the action or state requires it

### Requirement: Restrained motion and preserved native data behavior
The redesign SHALL preserve existing native scrolling, pull-to-refresh, pagination, data loading, and authentication behavior while limiting added motion to short press and transition feedback.

#### Scenario: Data page is refreshed
- **WHEN** the user pulls down on a page that loads data on entry
- **THEN** the existing refresh action runs and the page background remains visually continuous during native overscroll

#### Scenario: Interface motion occurs
- **WHEN** a button, row, dialog, or state transition responds to interaction
- **THEN** feedback is brief and restrained and empty-state artwork does not loop, float, bounce, or rotate

### Requirement: Responsive multi-identity verification
The redesigned mini program SHALL be verified with child, adult, and no-avatar account presentations at 320px, 375px, and 430px viewport widths.

#### Scenario: Representative identity matrix is rendered
- **WHEN** the visual verification harness renders the three identity variants at each required width
- **THEN** text remains inside its container, controls do not overlap, primary information remains visible, and no layout depends on a child-specific avatar or name length

#### Scenario: Production build is verified
- **WHEN** implementation is complete
- **THEN** unit tests, WeChat production build, build-facing E2E, asset checks, file-size checks, and strict OpenSpec validation pass without Docker
