## 1. OpenSpec Contract

- [x] 1.1 Create proposal, design, and delta specs for refined admin scene workflow UX.
- [x] 1.2 Validate the change strictly before implementation.

## 2. Scene Location And Object Picking

- [x] 2.1 Add reusable scene locator and scene object picker components for projects, lessons, people, and selected summaries.
- [x] 2.2 Replace project workspace dropdown selection with step-based motive and project location.
- [x] 2.3 Replace lesson workspace dropdown selection with step-based motive and lesson location.
- [x] 2.4 Preserve locked parent context for project and lesson relation actions after object selection.

## 3. Single-Sheet Document Editing

- [x] 3.1 Refactor document editing so long-form fields request one top-level editor sheet instead of nesting editor sheets inside resource forms.
- [x] 3.2 Wire generic resource forms to the top-level editor while preserving form state and save behavior.
- [x] 3.3 Wire guided creation long-form fields to the same top-level editor while preserving draft and step state.

## 4. Workspace Hierarchy

- [x] 4.1 Demote raw relation resources into an advanced maintenance section or visual hierarchy.
- [x] 4.2 Ensure teacher/admin navigation presents scene workspaces before low-level project, lesson, and relation resources.

## 5. Tests And Verification

- [x] 5.1 Add or update admin component tests for step-based scene locators and locked context actions.
- [x] 5.2 Add or update admin component tests for single-sheet document editing from resource and guided forms.
- [x] 5.3 Add or update admin tests for navigation hierarchy and advanced maintenance labeling.
- [x] 5.4 Run admin test, coverage, lint, and build commands.
- [x] 5.5 Run strict OpenSpec validation for `refine-admin-scene-workflow-ux`.
