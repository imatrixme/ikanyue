## Context

The points-lite Admin has two destinations: learner points and physical rewards. The current learner page keeps a selector, locked context card, mode-switched form, confirmation dialog, and history visible in one persistent workspace. The reward page keeps a catalog beside a permanent inspector. These layouts are technically responsive but force operators to reason about selection state and changing panel roles before each action.

The target operator repeatedly scans a list, identifies one learner or reward, performs one task, verifies the outcome, and returns to the same list position. The implementation must remain inside `ikanyue.admin`, preserve the existing `OpsApi` contracts, keep files below 500 lines, and avoid Docker during normal iteration.

## Goals / Non-Goals

**Goals:**
- Make each authenticated page start with one primary scan-and-compare surface.
- Expose frequent row actions without requiring an intermediate detail selection.
- Contain each detail or mutation task in one temporary overlay with locked human-readable context.
- Keep mutation form, review, submission, and failure recovery inside one dialog lifecycle.
- Provide keyboard focus containment, Escape handling, opener-focus restoration, and unsaved-change protection.
- Provide responsive desktop tables and mobile cards without horizontal page scrolling.
- Add persisted filters, sorting, and client-side pagination for the currently loaded records.

**Non-Goals:**
- No changes to Hono routes, PocketBase collections, authentication, ledger semantics, reward pricing, or object storage.
- No student mini program changes.
- No bulk point mutations, inventory, shipping, refunds, deletion, or online redemption.
- No root package, shared runtime package, or new UI dependency.
- No Docker verification until the final release gate.

## Decisions

### Primary pages are list-first

Learner points becomes a desktop table with mobile cards. Each record shows recognizable identity, current balance, affordable reward count, latest event summary when loaded, and direct grant, redeem, and detail actions. Reward management becomes a desktop table with mobile cards showing image, name, point price, status, sort order, and edit action.

The previous permanent context workspace and reward inspector are removed. Empty right-side placeholders disappear because no secondary surface exists until the operator requests one.

Alternative considered:
- Keep split panes and improve selected-state styling: rejected because the operator still has to track two simultaneous surfaces and the right pane still changes roles.

### Details and mutations use one reusable dialog shell

A local `DialogShell` owns overlay rendering, title/description association, initial focus, focus trapping, Escape behavior, background dismissal policy, and focus restoration. It supports compact, medium, and wide desktop sizes and becomes full-screen on mobile for long content.

Learner details, point mutations, and reward editing use separate scene components inside this shell. The shell is structural, not a nested decorative card; scene sections remain unframed or use simple separators.

Alternative considered:
- Add a dialog library: rejected because the existing project has no dialog dependency and the required behavior is narrow enough to implement and test locally.

### Point confirmation is a stage, not a nested dialog

Grant and redemption each open directly from a learner row. The selected learner is resolved before the dialog opens and is immutable for that dialog lifecycle. The dialog transitions from `edit` to `review`; review shows current balance, delta, resulting balance, and reward or reason. Canceling review returns to the entered form without API mutation or data loss. Successful confirmation closes the dialog after the existing refresh completes; failure keeps the review visible.

Alternative considered:
- Open a second confirmation dialog above the action dialog: rejected because nested overlays break focus order and make cancellation semantics ambiguous.

### Learner detail reconstructs the complete scene

The learner detail dialog presents identity and balance first, then redeemable and locked rewards, followed by point history. Desktop history uses a compact table and mobile history uses the existing timeline representation. Detail is read-only; grant and redeem remain direct table actions so high-frequency commands are not buried.

### Filters and pagination are local and persisted

Learner controls include keyword, minimum/maximum balance, and balance/name sorting. Reward controls include keyword, active status, point range, and price/name/sort-order sorting. Each page uses a small fixed page size with previous/next controls and resets to page one when filters change.

Filter values persist in `localStorage` under versioned points-lite keys. Invalid stored JSON or stale values fall back to defaults. Persistence applies only to filters and sorting, never dialog drafts or selected records.

Alternative considered:
- Add server-side filter and pagination parameters: rejected because the current release data volume and API contract do not require backend expansion.

### Update and failure behavior stays local to the requested task

Opening details waits for the learner summary request and shows an overlay loading state. Failed lookup keeps the list intact and uses the existing error feedback. Mutation and reward-save failures keep the dialog open with entered data. Success closes the overlay, refreshes list data through existing callbacks, and restores focus to the originating row action when it still exists.

## Risks / Trade-offs

- Client-side pagination only covers records returned by the current API request → Label counts from the loaded result and keep the control implementation replaceable if server pagination is added later.
- A custom focus trap can miss unusual controls → Centralize focusable selectors in `DialogShell` and cover forward Tab, reverse Tab, Escape, and restoration in unit/E2E tests.
- Full-screen mobile dialogs can lose list context → Keep learner/reward identity in a sticky dialog header and restore the originating list position and focus on close.
- Persisted filters can make records appear missing → Show active-filter count and provide one-click reset.
- Direct row actions increase visual density → Use compact icon-and-text actions on desktop and full-width explicit actions on mobile.

## Migration Plan

1. Add reusable dialog, filter persistence, pagination, and responsive record-presentation primitives.
2. Replace the learner split workspace with list-first rows/cards and learner action/detail dialogs.
3. Replace the reward catalog/inspector with list-first rows/cards and a reward editor dialog.
4. Update unit and Playwright tests for interaction intent, focus lifecycle, persisted controls, responsive rendering, and existing live API flows.
5. Roll back by reverting the Admin submodule commit; no data migration or API rollback is required.

## Open Questions

- None blocking. Server-side pagination remains a future option if the loaded learner or reward collections exceed practical client-side limits.
