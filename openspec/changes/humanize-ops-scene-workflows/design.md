## Context

The admin project already has resource APIs, semantic pickers, guided creation flows, and raw maintenance tables. The remaining problem is interaction intent: operators still see project memberships, teacher assignments, lesson attendance, and lesson teacher overrides as separate data tables. That forces them to understand implementation structure before they can do normal school operations.

The new project-level `human-centered-interaction-design` skill formalizes the rule for this change: start from the operator's motive, preserve known context, hide diagnostic data from the main path, and optimize for understanding cost instead of implementation cost.

## Goals / Non-Goals

**Goals:**
- Add project and lesson scene workspaces for daily teaching operations.
- Turn relation-table edits into context-locked actions when the project or lesson is already known.
- Provide reusable scene components for context summaries, rosters, role assignment, attendance, inherited teacher comparison, and action dialogs.
- Move long-form fields into a dedicated document editor modal with edit, preview, split, Markdown, and HTML modes.
- Preserve raw resource tables as advanced diagnostics.
- Add tests for intent-level behavior, relation payload generation, editor modes, and scene reconstruction from loaded resources.

**Non-Goals:**
- No Flutter or mini program UI changes.
- No PocketBase schema migration.
- No new root JavaScript workspace or parent repository dependencies.
- No direct browser access to PocketBase.
- No automatic scheduling optimizer, payroll, CRM, payment, or teacher availability engine.
- No removal of generic resource maintenance.

## Decisions

1. Build scene workspaces on top of loaded resource data.
   - Rationale: existing admin resource APIs already provide the records needed to reconstruct project and lesson scenes.
   - Alternative considered: add new backend aggregate endpoints first. That would be cleaner for large data sets but expands API, authorization, and migration scope before the workflow shape is validated.

2. Treat relation records as action results, not primary forms.
   - Rationale: an operator on a project page already knows the project; asking them to search and select that project again creates avoidable error risk.
   - Alternative considered: keep relation resource forms but improve labels. This still exposes implementation structure and keeps training cost high.

3. Use context-locked action dialogs for project and lesson relations.
   - Rationale: the dialog can show what is fixed, what the operator still decides, and what records will be created or updated.
   - Alternative considered: inline editable tables. Inline tables are fast for expert bulk editing but harder for new operators to understand and easier to mis-edit without context.

4. Represent people through role and roster components.
   - Rationale: people selection needs identity, status, role, and relationship to the current scene, not just a name in a select.
   - Alternative considered: reuse the generic entity picker everywhere. It is still valuable for unknown-context forms, but it is unnecessary when the scene already defines the parent and likely candidate pool.

5. Open long-form writing in a document editor modal.
   - Rationale: introductions, lesson notes, report copy, and rich content need space, preview, and image handling; they should not live as tiny controls at the bottom of a dense form.
   - Alternative considered: keep the inline rich text editor and increase its height. That improves typing space but does not solve review, preview, draft, or parent-form summary behavior.

6. Keep raw tables available under advanced maintenance.
   - Rationale: administrators still need low-level correction and audit views, but those should not be the default path for daily work.
   - Alternative considered: remove relation tables from navigation. This would make operations cleaner but reduces recovery options during rollout.

## Risks / Trade-offs

- [Risk] Scene workspaces may duplicate information from raw tables. -> Mitigation: duplicate presentation only; source records remain the existing resources and relation records.
- [Risk] Context actions may initially support fewer bulk operations than raw tables. -> Mitigation: keep raw maintenance available and add explicit scene actions for the common operations first.
- [Risk] Client-side reconstruction can be incomplete when resources are partially loaded. -> Mitigation: show explicit empty/loading states and test reconstruction with missing optional relations.
- [Risk] Document editor modal can feel heavy for short text. -> Mitigation: keep compact summaries in forms and open the modal only when editing meaningful long-form content.
- [Risk] Test coverage for UI-heavy scenes can become brittle. -> Mitigation: test pure scene derivation and payload builders separately from focused component interaction tests.

## Migration Plan

1. Add scene workflow specs and tasks.
2. Add pure scene models/helpers for projects, sessions, roster state, teacher inheritance, and relation payloads.
3. Add reusable scene UI components and document editor modal inside `ikanyue.admin`.
4. Add project and lesson scene entries while keeping raw maintenance resources reachable.
5. Replace relation-resource creation guidance with scene action entry points when parent context is available.
6. Run admin unit tests, coverage, lint, build, and OpenSpec validation.
7. Roll back by hiding scene entries and reverting scene components; raw resource maintenance remains unchanged.

## Open Questions

- Whether later production scale needs backend aggregate endpoints for project and lesson scenes.
- Whether relation actions should support bulk CSV import in addition to visual rosters.
- Which rich-text image upload path should become canonical when the editor moves from browser-held drafts to persisted uploads.
