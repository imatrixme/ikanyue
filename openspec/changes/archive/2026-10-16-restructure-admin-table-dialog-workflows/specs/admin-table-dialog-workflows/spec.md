## ADDED Requirements

### Requirement: List-First Admin Pages
The Admin SHALL present learner points and reward management as one primary scan-and-compare surface per page without a permanent detail, action, or editor pane.

#### Scenario: Administrator opens learner points
- **WHEN** an administrator opens the learner points destination
- **THEN** the page displays learner identity, current balance, affordability context, and direct row actions in a desktop table or mobile cards without showing a persistent learner action workspace

#### Scenario: Administrator opens reward management
- **WHEN** an administrator opens the reward management destination
- **THEN** the page displays reward image, name, point price, status, sort context, and edit action in a desktop table or mobile cards without showing a persistent reward inspector

#### Scenario: Page is viewed on mobile
- **WHEN** either primary page is viewed between 320px and 767px wide
- **THEN** each record becomes a structured card that preserves identity, key comparison fields, and actions without horizontal page scrolling

### Requirement: Single-Overlay Task Workflows
The Admin SHALL use at most one temporary overlay for a learner detail, point mutation, reward creation, or reward edit task.

#### Scenario: Administrator grants points from a learner row
- **WHEN** an administrator activates the grant action for a learner
- **THEN** one dialog opens with that learner locked as context and contains the edit and review stages of the grant workflow

#### Scenario: Administrator redeems a reward from a learner row
- **WHEN** an administrator activates the redemption action for a learner
- **THEN** one dialog opens with that learner locked as context and contains reward selection, review, and confirmation without opening a nested dialog

#### Scenario: Administrator edits a reward
- **WHEN** an administrator activates create or edit from reward management
- **THEN** one dialog contains the full reward form, managed image workflow, save, cancel, and close behavior

#### Scenario: Administrator views learner detail
- **WHEN** an administrator activates learner detail
- **THEN** one read-only overlay shows learner identity, balance, reward affordability, and complete point history

### Requirement: Staged Mutation Confirmation
The point mutation dialog SHALL preserve entered data while separating editable input from final review and SHALL call the API only from the review stage.

#### Scenario: Grant enters review
- **WHEN** an administrator submits a valid grant form
- **THEN** the same dialog shows learner, reason, amount, current balance, and resulting balance without calling the grant API

#### Scenario: Redemption enters review
- **WHEN** an administrator submits a valid redemption form
- **THEN** the same dialog shows learner, reward, stored point price, current balance, and resulting balance without calling the redemption API

#### Scenario: Administrator returns to edit
- **WHEN** the administrator returns from review to edit
- **THEN** the previously entered amount, reason, remark, or selected reward remains available and no mutation API has been called

#### Scenario: Mutation fails
- **WHEN** the administrator confirms a mutation and the API rejects or fails
- **THEN** the dialog remains open with its review context and entered data available for retry or correction

#### Scenario: Mutation succeeds
- **WHEN** the administrator confirms a mutation and the API succeeds
- **THEN** the dialog closes, the affected learner data refreshes, success feedback is shown, and focus returns to the originating action when available

### Requirement: Accessible Dialog Lifecycle
Every Admin task overlay SHALL provide deterministic keyboard, dismissal, and focus behavior.

#### Scenario: Dialog opens
- **WHEN** an overlay opens
- **THEN** focus moves into the overlay, background content is not part of the active interaction, and the dialog title and description are programmatically associated

#### Scenario: Keyboard focus reaches a boundary
- **WHEN** the user presses Tab or Shift+Tab at the first or last focusable control
- **THEN** focus wraps within the current overlay

#### Scenario: Dialog closes
- **WHEN** the user completes or cancels a task
- **THEN** the overlay closes and focus returns to the control that opened it when that control still exists

#### Scenario: Unsaved reward edit is dismissed
- **WHEN** a reward form contains unsaved changes and the user presses Escape, clicks the close control, or requests background dismissal
- **THEN** the system asks for discard confirmation before closing the editor

### Requirement: Learner Detail Presentation
The learner detail overlay SHALL reconstruct the learner's points scene without hiding information required to explain affordability or ledger history.

#### Scenario: Learner detail loads
- **WHEN** learner summary data is available
- **THEN** the overlay shows identity, current balance, redeemable rewards, locked rewards with point gap, and point events ordered newest first

#### Scenario: Detail history is viewed on desktop
- **WHEN** learner detail is viewed at desktop width
- **THEN** action, delta, resulting balance, reason, and time are shown in a compact table

#### Scenario: Detail history is viewed on mobile
- **WHEN** learner detail is viewed at mobile width
- **THEN** the same event data is shown as a readable vertical timeline without horizontal scrolling

#### Scenario: Learner detail cannot load
- **WHEN** the learner summary request fails
- **THEN** the primary learner list remains usable and the system exposes retry or existing error feedback without showing stale detail data

### Requirement: Persisted Table Controls
The Admin SHALL provide task-relevant filters, sorting, reset, and client-side pagination for currently loaded learners and rewards.

#### Scenario: Administrator filters learners
- **WHEN** the administrator enters a keyword or balance range or changes learner sorting
- **THEN** the loaded learner records are filtered and ordered, pagination returns to the first page, and an active-filter indication is shown

#### Scenario: Administrator filters rewards
- **WHEN** the administrator enters a keyword, status, point range, or reward sorting
- **THEN** the loaded reward records are filtered and ordered, pagination returns to the first page, and an active-filter indication is shown

#### Scenario: Administrator changes pages
- **WHEN** filtered results exceed one page
- **THEN** previous and next controls change the visible record page while preserving the current filters and sorting

#### Scenario: Administrator returns later
- **WHEN** valid saved filter preferences exist in local storage
- **THEN** the corresponding Admin page restores those filters and sorting without restoring dialogs, drafts, or selected records

#### Scenario: Saved preferences are invalid
- **WHEN** stored filter data is malformed or contains unsupported values
- **THEN** the page uses documented default controls and remains usable

#### Scenario: Administrator resets controls
- **WHEN** the administrator activates reset
- **THEN** all task filters and sorting return to defaults, persisted preferences are updated, and the first result page is shown

### Requirement: Deterministic Task States
List and overlay workflows SHALL expose loading, empty, failure, and success states without replacing the primary page with an unrelated surface.

#### Scenario: No records match filters
- **WHEN** loaded learners or rewards exist but no records match active filters
- **THEN** the primary surface shows a filtered-empty state with a reset action

#### Scenario: No records exist
- **WHEN** no learner or reward records are loaded
- **THEN** the page shows a true empty state with the next valid action and does not show an empty inspector

#### Scenario: Reward save fails
- **WHEN** reward creation, editing, or image upload fails
- **THEN** the editor remains open with entered values and existing error feedback available

#### Scenario: Reward save succeeds
- **WHEN** reward creation or editing succeeds
- **THEN** the editor closes, reward data refreshes through the existing callback, and focus returns to the originating create or edit control

### Requirement: Existing Service Contracts Remain Stable
The table-dialog restructuring SHALL use the existing points-lite Admin API and data contracts.

#### Scenario: Admin build is inspected
- **WHEN** the restructured workflows are built and exercised
- **THEN** they continue using the existing `/ops/points/*` and `/ops/reward-items*` requests without adding a root dependency, Hono route, or PocketBase field
