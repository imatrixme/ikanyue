## ADDED Requirements

### Requirement: Current lightweight Admin scope is preserved
The Admin redesign SHALL include only the current hard-fork workflows for operations authentication, student management, point lookup and grants, reward catalog management, and offline redemption.

#### Scenario: The redesigned navigation is rendered
- **WHEN** an authenticated operator opens the Admin
- **THEN** it does not expose removed teaching operations, assessment, reporting, shipping, refund, or resource-management modules

### Requirement: Structured operations workspace
Each Admin module SHALL use a stable operations layout composed from a page header, optional summary band, filter or action toolbar, primary table or operational list, and focused detail or mutation surface.

#### Scenario: An operator changes modules
- **WHEN** the operator chooses students, points, or rewards from primary navigation
- **THEN** the main workspace changes at the navigation level and does not simulate a new page through unrelated conditional panels inside the current module

#### Scenario: An operator inspects a record
- **WHEN** the operator opens student, point-event, or reward details
- **THEN** the details appear in an accessible dialog or drawer while the originating list remains stable

### Requirement: Local Admin primitive library
The Admin SHALL provide token-driven local primitives for commands, form controls, navigation, feedback, data display, overlays, asynchronous states, media upload, and image preview.

#### Scenario: A workflow needs a standard control
- **WHEN** a page needs a button, icon button, tooltip, field, input, select, segmented control, badge, alert, table, pagination, dialog, drawer, empty state, skeleton, error state, uploader, or preview
- **THEN** it composes the local primitive instead of creating a page-specific duplicate

### Requirement: Admin domain components
The Admin SHALL compose domain components for student lists/details, point ledger and adjustments, reward catalog/editing, and redemption confirmation.

#### Scenario: A point grant is initiated
- **WHEN** an operator starts a point adjustment from a student or ledger context
- **THEN** the shared point-adjustment component presents the selected student, signed amount, reason, validation, and explicit confirmation

#### Scenario: A reward is edited or redeemed
- **WHEN** an operator opens reward editing or redemption
- **THEN** shared domain components preserve image, price, enabled state, stock presentation where available, student balance, and confirmation context

### Requirement: Complete interaction states
Every Admin data surface and mutation SHALL expose explicit loading, empty, error, disabled, success, destructive, and focus-visible states where applicable.

#### Scenario: A list request fails
- **WHEN** the Admin cannot load students, point events, or rewards
- **THEN** the workspace shows a recoverable error state with a retry command and does not present an empty result as success

#### Scenario: A destructive or point-consuming action is confirmed
- **WHEN** an operator is about to disable a student, deduct points, or redeem an item
- **THEN** the confirmation identifies the subject, consequence, and final command using the destructive or high-consequence state tokens

### Requirement: Responsive and accessible Admin
The Admin SHALL remain operable from 768px through 1440px and wider desktop viewports with coherent table fallback behavior, keyboard focus order, labelled controls, and no clipped text or overlapping actions.

#### Scenario: A workspace is viewed at a narrow supported width
- **WHEN** the viewport is 768px wide
- **THEN** filters and actions reflow, data remains inspectable, and dialogs or drawers fit without horizontal page overflow

#### Scenario: An operator uses only a keyboard
- **WHEN** they navigate, open an overlay, submit or cancel, and return to the list
- **THEN** focus is visible, trapped while appropriate, and restored to the initiating control

### Requirement: Existing Admin contracts remain authoritative
The UI migration SHALL preserve current `/ops/*` calls, auth handling, upload routing, public MinIO image URLs returned by the API, and existing business validations.

#### Scenario: Admin tests run after a visual migration
- **WHEN** unit, E2E, SSR, and production build checks execute
- **THEN** current authentication, student, point, reward, upload, and redemption workflows pass without direct browser access to PocketBase or MinIO credentials

