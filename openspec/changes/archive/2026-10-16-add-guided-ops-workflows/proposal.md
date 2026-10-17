## Why

The admin system still asks operators to think in database resources such as programs, sessions, joins, and report instances, while real school operations begin from human intent: publish an activity, collect signups, split students into classes, arrange lessons, record attendance, or launch reports. This change makes daily operations understandable by introducing scenario-first creation flows and scene-based redundant views, with normalized data tables kept as advanced maintenance tools rather than the primary UX.

## What Changes

- Add scenario-first operations entry points for common human intents: publish signup activity, arrange trial lesson, open long-term class, add lesson, process signups and class assignment, record attendance, and launch assessments/reports.
- Add a reusable guided creation dialog with a vertical stepper on the left and small, focused step forms on the right; each creation flow explicitly confirms purpose, participants, time, place, responsible people, rules, and generated results.
- Add activity, class, lesson, signup, student, teacher, and report scene views that redundantly present the same underlying data from business contexts rather than mixing unrelated records in one flat table.
- Add guided flow planning and submission logic that derives default parameters from the selected scene so operators do not manually choose low-level scope/type/status values unless they are in an advanced maintenance view.
- Keep raw resource tables available under advanced data maintenance for audit, repair, and exceptional corrections.
- Add focused unit tests and coverage gates for guided flow definitions, default derivation, payload planning, and admin UI interactions.

## Capabilities

### New Capabilities
- `guided-ops-workflows`: Scenario-first operations creation, step-by-step guided dialogs, scene-based redundant data views, and generated-operation summaries for activity, signup, class, lesson, attendance, and report workflows.

### Modified Capabilities
- `ops-admin-system`: The standalone admin UI must prioritize scenario workflows and scene views over raw tables while preserving advanced data maintenance for low-level records.
- `subproject-unit-test-coverage`: Admin guided workflow logic and components must have focused unit coverage and pass the repo's coverage gates.

## Impact

- `ikanyue.admin`: information architecture, sidebar labels, scene workflow views, guided creation dialog components, guided flow definitions, payload planning logic, tests, and coverage scripts.
- `ikanyue.mapi.hono`: no direct PocketBase access from the browser; existing `/ops/resources/*` endpoints may be reused for first implementation, with backend workflow APIs introduced only if needed by the implementation.
- `openspec`: new guided workflow capability and deltas for admin UX and coverage requirements.
- Systems: Flutter remains out of scope; parent repo stays dependency-neutral with no root `package.json`, lockfile, or workspace.
