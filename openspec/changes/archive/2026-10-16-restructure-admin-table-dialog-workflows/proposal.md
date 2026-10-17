## Why

The points-lite Admin now has consistent visuals and safe mutations, but its primary pages still split attention between persistent list, context, form, inspector, and history regions. Administrators need a clearer model where pages support scanning and comparison while temporary overlays contain one explicit detail or mutation task.

## What Changes

- Replace the learner selector plus persistent right-side workspace with a desktop learner table and mobile learner cards that expose balance, affordability, recent activity, and direct row actions.
- Replace the reward catalog plus persistent inspector with a desktop reward table and mobile reward cards; create and edit rewards in one temporary overlay.
- Move grant, offline redemption, learner detail, point history, reward create, and reward edit into single-overlay workflows with locked context and no nested dialogs.
- Add focus trapping, opener-focus restoration, Escape handling, unsaved-change protection, deterministic loading/error/empty states, and responsive full-screen treatment for long mobile forms.
- Add P2 table controls for status, point range, sorting, pagination, and locally persisted filter preferences without changing API or data contracts.
- Keep confirmation as a second stage inside the same mutation dialog and refresh only the affected table row after success.

## Capabilities

### New Capabilities
- `admin-table-dialog-workflows`: List-first Admin information architecture, task dialogs, detail overlays, responsive data presentation, focus management, filtering, and interaction-state requirements for learner points and reward management.

### Modified Capabilities

## Impact

- `ikanyue.admin`: learner points workspace, reward management, dialog infrastructure, table/card presentation, filtering state, interaction tests, and Playwright coverage.
- Root OpenSpec artifacts and the Admin submodule pointer only.
- No changes to Hono APIs, PocketBase schema, Taro mini program, authentication, ledger rules, reward pricing, or root JavaScript dependencies.
- Docker remains excluded from continuous implementation verification and is reserved for final release validation.
