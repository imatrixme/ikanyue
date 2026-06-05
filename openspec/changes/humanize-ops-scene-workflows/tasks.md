## 1. Scene Models

- [x] 1.1 Add pure admin scene helpers that reconstruct project and lesson scenes from loaded resources.
- [x] 1.2 Add context-locked payload builders for project students, project teachers, lesson students, and lesson teachers.
- [x] 1.3 Add candidate grouping helpers that promote already selected people and preserve secondary identity details.

## 2. Scene Components

- [x] 2.1 Add reusable locked context, roster, role assignment, attendance, and inherited teacher components.
- [x] 2.2 Add a document editor modal with edit, preview, split, Markdown, and HTML-oriented review modes.
- [x] 2.3 Replace inline long-form editing in generic forms with compact summaries that open the document editor modal.

## 3. Admin Integration

- [x] 3.1 Add primary teaching navigation entries for project and lesson scene workspaces.
- [x] 3.2 Add project workspace actions for adding students and assigning teachers without reselecting the project.
- [x] 3.3 Add lesson workspace actions for recording attendance and confirming teachers without reselecting the lesson.
- [x] 3.4 Add secondary guidance on raw relation resource pages that points operators back to the relevant scene workflow.

## 4. Tests

- [x] 4.1 Add unit tests for scene reconstruction and relation payload generation.
- [x] 4.2 Add component tests for locked context displays, selected people promotion, and scene action forms.
- [x] 4.3 Add component tests for document editor modal mode switching and draft preservation.

## 5. Verification

- [x] 5.1 Run OpenSpec validation for `humanize-ops-scene-workflows`.
- [x] 5.2 Run admin unit tests, coverage, lint, and build from `ikanyue.admin`.
- [x] 5.3 Commit the project-level skill, OpenSpec artifacts, admin implementation, and submodule pointer updates.
