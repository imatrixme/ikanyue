## 1. Guided Workflow Core

- [x] 1.1 Add typed guided workflow definitions for signup activity, trial lesson, long-term class, add lesson, attendance, and report launch scenarios.
- [x] 1.2 Implement pure generated-plan logic that derives default resources, statuses, pending facts, and operation summaries from guided answers.
- [x] 1.3 Ensure every workflow definition includes purpose, participants, time, place, people, rules, and confirmation steps.

## 2. Guided Creation UI

- [x] 2.1 Add a reusable guided creation dialog with a left vertical stepper, focused right-side step fields, footer navigation, and generated-result summary.
- [x] 2.2 Add field controls for text, choice, multiselect, date/time, location, people assignment, pending markers, and confirmation.
- [x] 2.3 Preserve answers when moving between steps and recompute the generated plan preview after edits.

## 3. Scenario Workspace Integration

- [x] 3.1 Add a guided operations workspace entry to the admin shell and sidebar while keeping raw data tables under advanced maintenance.
- [x] 3.2 Add scene cards/tabs for signup activities, trial lessons, classes, lessons, attendance, and reports.
- [x] 3.3 Wire each scene action to open the appropriate guided creation dialog with scenario defaults.
- [x] 3.4 Present scene-based redundant summaries that explain where the generated data will appear after creation.

## 4. Tests And Coverage

- [x] 4.1 Add unit tests for workflow definitions and required step coverage.
- [x] 4.2 Add unit tests for generated operation plans for all first-phase scenarios.
- [x] 4.3 Add React interaction tests for guided dialog navigation, pending facts, answer preservation, and confirmation summaries.
- [x] 4.4 Ensure admin coverage remains at or above 90% for lines, branches, functions, and statements.

## 5. Verification

- [x] 5.1 Run admin focused tests, full unit tests, coverage, build, and lint.
- [x] 5.2 Run `openspec validate add-guided-ops-workflows --strict --no-interactive`.
- [x] 5.3 Rebuild and restart the local Docker admin container and verify the served asset fingerprint when UI changes are complete.
- [x] 5.4 Confirm parent repo remains dependency-neutral and Flutter remains untouched.
