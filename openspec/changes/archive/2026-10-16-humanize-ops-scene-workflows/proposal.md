## Why

The admin UI already exposes the data needed for lightweight teaching operations, but daily operators still have to translate human goals into raw relation-table edits. This increases training cost, makes context mistakes likely, and buries important writing tasks inside cramped generic forms.

## What Changes

- Add scene-based project and lesson workspaces that start from operator motives such as managing a project roster, assigning teachers, confirming a lesson, recording attendance, and continuing after class.
- Replace normal creation of project/student, project/teacher, lesson/student, and lesson/teacher relation records with context-locked scene actions when the parent project or lesson is already known.
- Add reusable interaction primitives for locked context summaries, rosters, role assignment, attendance boards, inherited-vs-overridden teacher views, and scene action dialogs.
- Move meaningful long-form writing out of the bottom of generic forms into a large document editor with edit, preview, split, Markdown, and HTML modes.
- Keep raw resource tables available as advanced maintenance and diagnostics, not the primary operating path.
- Add focused tests for scene intent, locked context behavior, relation payload generation, document editor modes, and admin coverage.

## Capabilities

### New Capabilities
- `scene-based-ops-workspaces`: Project and lesson workspaces that present daily operations through human scenes, context-locked actions, and redundant business views.

### Modified Capabilities
- `ops-admin-system`: The standalone admin UI must prioritize scene-specific project and lesson operations over raw relation-table CRUD, and long-form fields must use a dedicated document editing experience.
- `subproject-unit-test-coverage`: Admin coverage must include scene workflow logic, relation action payloads, and document editor behavior under the existing coverage gate.

## Impact

- Affects `ikanyue.admin` UI components, workflow definitions, resource form behavior, and tests.
- Does not require Flutter changes.
- Does not add a parent repository JavaScript workspace, root package metadata, or root lockfile.
- Uses existing `/ops/*` APIs and does not introduce direct PocketBase browser access.
