## ADDED Requirements

### Requirement: Responsive Reward Management
The Admin SHALL present reward identity and actions without horizontal page or catalog scrolling at supported mobile and desktop widths.

#### Scenario: Mobile administrator scans rewards
- **WHEN** an administrator opens the reward catalog at a viewport between 320px and 767px wide
- **THEN** each reward displays its image state, name, point price, status, and edit action in one visible reward row without requiring horizontal scrolling

#### Scenario: Mobile administrator edits a reward
- **WHEN** an administrator starts editing a reward on a mobile viewport
- **THEN** the system opens a viewport-filling editor identified by the reward name and provides explicit save, cancel, and close actions

#### Scenario: Desktop administrator edits without list displacement
- **WHEN** an administrator edits a reward on a desktop viewport
- **THEN** the catalog remains visible beside a stable inspector and focusing editor or row controls does not scroll the reward identity out of view

#### Scenario: Legacy image URL is secondary
- **WHEN** an administrator edits a reward
- **THEN** managed image upload is presented as the normal image workflow and the legacy absolute URL field is available only in an advanced section

### Requirement: Resilient Reward Media
Admin and mini program reward surfaces SHALL render deterministic loading, missing, loaded, and failed media states in a stable frame.

#### Scenario: Reward image loads
- **WHEN** a reward has a valid image URL and the image loads successfully
- **THEN** the image is shown in a stable 4:3 frame without changing surrounding layout dimensions

#### Scenario: Reward image is missing
- **WHEN** a reward has no image URL
- **THEN** the surface displays a neutral placeholder derived from the reward name

#### Scenario: Reward image fails
- **WHEN** a reward image request or decode fails
- **THEN** the surface replaces the broken image with the same neutral placeholder and keeps the reward usable

### Requirement: Confirmed Point Mutations
The Admin SHALL preview point mutation results against a locked learner context before calling the mutation API.

#### Scenario: Administrator reviews a point grant
- **WHEN** an administrator submits a valid point grant
- **THEN** the system shows the selected learner, amount, reason, current balance, and resulting balance and does not call the grant API until confirmation

#### Scenario: Administrator reviews an offline redemption
- **WHEN** an administrator submits a valid reward redemption
- **THEN** the system shows the selected learner, reward identity, stored point price, current balance, and resulting balance and does not call the redemption API until confirmation

#### Scenario: Administrator cancels confirmation
- **WHEN** an administrator cancels a point mutation confirmation
- **THEN** no mutation API is called and the entered action data remains available for correction

#### Scenario: Mutation completes
- **WHEN** an administrator confirms a point grant or offline redemption and the API succeeds
- **THEN** the system closes the confirmation, refreshes learner state, and shows the existing success feedback

### Requirement: Responsive Point History
The Admin SHALL preserve complete point-event information in a viewport-appropriate presentation.

#### Scenario: Desktop history uses a compact table
- **WHEN** point history is viewed at a desktop width
- **THEN** action type, delta, resulting balance, reason, and time are displayed in a compact table

#### Scenario: Mobile history uses a timeline
- **WHEN** point history is viewed at a mobile width
- **THEN** the same action type, delta, resulting balance, reason, and time are displayed as vertically stacked timeline entries without horizontal scrolling

### Requirement: Reward-First Mini Program
The mini program SHALL prioritize currently obtainable rewards and clearly communicate progress toward locked rewards.

#### Scenario: Student has redeemable rewards
- **WHEN** an authenticated student opens the points page with one or more redeemable rewards
- **THEN** a compact current-points summary is followed immediately by a “现在可以领取” section containing those rewards

#### Scenario: Student has locked rewards
- **WHEN** an authenticated student has a reward priced above the current balance
- **THEN** the “继续积累” section shows the reward, its point price, a clamped progress indicator, and the remaining points required

#### Scenario: Student refreshes data
- **WHEN** the student activates the compact refresh control
- **THEN** the page reloads reward availability, shows a loading state, and preserves a stable layout

#### Scenario: Student is signed out
- **WHEN** an unauthenticated student opens the points page
- **THEN** the page shows a login-focused empty state and does not present stale rewards or balance

#### Scenario: Reward request fails
- **WHEN** reward availability cannot be loaded
- **THEN** the page shows an error state with a retry action and does not replace it with an affordability empty state

### Requirement: Coherent Points-Lite Language
Admin and mini program SHALL use consistent Chinese labels and shared semantic color roles for points, redeemable status, informational state, and destructive changes.

#### Scenario: Product labels render
- **WHEN** a user opens an authenticated points-lite screen
- **THEN** primary workflow labels and context labels are Chinese and do not mix English eyebrow copy into the main task hierarchy

#### Scenario: Semantic states render
- **WHEN** points, redeemable rewards, informational badges, success feedback, or negative ledger events are displayed
- **THEN** each uses the documented coral, jade, blue, or destructive semantic role consistently within its submodule
