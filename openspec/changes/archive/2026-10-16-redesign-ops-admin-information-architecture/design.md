## Context

`ikanyue.admin` is already a standalone Vite/React/Tailwind admin project with local shadcn-style UI primitives and `/ops/*` API usage. The current authenticated shell centers the whole application in a `max-w-[1440px]` container, renders every navigation item in one flat list, and keeps generic resource forms inline under resource tables. That worked for the first phase, but the new teaching project, session, report, signup, material, and audit modules need clearer hierarchy and faster daily-operation workflows.

## Goals / Non-Goals

**Goals:**
- Make the authenticated admin workspace full width, with no centered page-width cap.
- Replace flat navigation with grouped operations sections and a desktop sidebar that can collapse to icons through an explicit always-reachable control.
- Add a system settings section that clearly exposes registration, account, mini program, resource, permission, health, and audit setting categories.
- Move resource create/edit UI into reusable centered modal components so tables remain scannable.
- Keep shadcn-style components local and reusable, with small focused primitives instead of large monolithic views.
- Preserve current auth, forced-password-change, role gating, SSR build, and `/ops/*` API boundary.
- Load relationship selector options from authenticated API-backed resource lists instead of mock defaults.

**Non-Goals:**
- No Flutter changes.
- No root JavaScript workspace, root package manager files, or root dependency changes.
- No direct PocketBase browser access.
- No writable secrets management in the first UI pass; sensitive environment-backed settings are displayed only as operational categories/status.
- No broad backend data-model change unless required to render the new admin structure.

## Decisions

1. **Use local shadcn-style primitives instead of the shadcn CLI.**
   - Rationale: the admin project already has Tailwind 4, `clsx`, `tailwind-merge`, and local `components/ui` primitives. Creating local `Dialog`, `Sheet`, `Toolbar`, `Sidebar`, and status components keeps dependency scope small and avoids root repo churn.
   - Alternative considered: run the shadcn CLI and install a full component set. That is heavier, may introduce dependency churn, and is unnecessary for this focused redesign.

2. **Represent navigation as grouped data in `resourceConfig.ts`.**
   - Rationale: the app already drives navigation from config. Extending this into `navGroups` preserves existing access checks while making the hierarchy explicit and testable.
   - Alternative considered: hard-code sections in `Shell`. That would make future module moves and role filtering harder.

3. **Make the sidebar an explicit icon rail with nested sections.**
   - Rationale: the sidebar must stay recoverable after collapse and the module count is now high enough to need second-level labels inside large groups. A stateful toggle button is clearer than hover-only behavior.
   - Alternative considered: hover/focus expansion. It is fast, but it made the compact sidebar feel unstable and does not satisfy the need for a deliberate expand affordance.

4. **Use centered modal overlays for create/edit resource forms, not inline page stacks or right drawers.**
   - Rationale: operators need a focused form with enough horizontal space for two-column fields. A centered modal preserves list context without making forms feel like a narrow side panel.
   - Alternative considered: separate create/edit routes. That would be heavier for this admin and less efficient for simple resource edits.

5. **Add a first-pass System Settings view as categorized operational settings.**
   - Rationale: the admin currently lacks a place to explain registration/account/miniapp/resource/permission/health configuration. A view can land the information architecture now; writable settings APIs can follow as a separate backend capability.
   - Alternative considered: adding DB-backed settings immediately. That adds backend schema and migration risk beyond the current UI structure objective.

6. **Drive relationship options from live resource data.**
   - Rationale: mock-backed choices can make non-existent records appear selectable. The App loads form dependencies for the active resource view and passes those API-backed lists into tables and comboboxes.
   - Alternative considered: hard-code common options in form config. That is simpler, but it breaks as soon as production data differs from fixtures.

## Risks / Trade-offs

- Full-width workspace can become visually loose on very wide displays -> Use dense table areas, stable gutters inside views, and a fixed-width sidebar rail instead of centered page caps.
- Collapsed sidebar controls can become unreachable if the rail is too narrow -> Render the expand button as the primary visible item in compact mode and keep labels as tooltips.
- Modal forms can hide validation context -> Keep form titles/descriptions and submit/cancel actions inside the dialog with clear error/toast handling.
- System settings may appear writable before APIs exist -> Mark env-backed or future settings as status/configuration categories instead of editable controls.
- Relationship dropdowns depend on extra list calls -> Load dependencies alongside the active resource list with bounded pagination and show an explicit empty state when no real records exist.
- Refactoring shared shell/resources may break tests -> Update component tests around navigation grouping, settings view, and overlay form behavior.
