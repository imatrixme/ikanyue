## Why

The points-lite Admin can operate on existing learner balances but cannot create or maintain the learner records that those operations depend on. Administrators need one lightweight student directory inside the same hard-forked console without restoring the broader academic-management product.

## What Changes

- Add a dedicated student-management navigation item with a responsive table/card directory, search, status filtering, and deterministic loading, empty, and failure states.
- Add single-dialog create and edit workflows for learner name, nickname, cellphone, password, and enabled/disabled status.
- Add Admin-only `/ops/students` list, create, and update APIs backed by the existing PocketBase `students` collection.
- Preserve learner and point-ledger records by using enabled/disabled status instead of hard deletion.
- Keep student management out of the mini program and exclude classes, schedules, reports, teachers, enrollment, delivery, refunds, and other academic workflows.
- Fix shared form controls so native input minimum widths cannot overlap neighboring grid columns on wide Admin layouts.

## Capabilities

### New Capabilities
- `lite-student-management`: Lightweight Admin student directory, create/edit/status workflows, and Admin-only student-management API contracts.

### Modified Capabilities

## Impact

- `ikanyue.admin`: navigation, application state/API contracts, student list and editor dialogs, responsive controls, unit tests, and desktop/mobile Playwright coverage.
- `ikanyue.mapi.hono`: ops routes, student service methods, validation, audit calls, service tests, and local smoke coverage.
- Existing PocketBase `students` records are reused; no new collection or migration is required.
- `ikanyue.taro3` and root dependency manifests remain unchanged.
- Docker remains excluded during implementation and is reserved for final release validation.
