## Why

The operations admin has grown from a first-phase resource list into a real teaching, content, reporting, and system management tool, but its navigation and forms still read as a flat prototype. This change makes the admin UI usable for daily operations by introducing a structured information architecture, full-width workspace, explicit collapsible sidebar, API-backed relationship selectors, persistent sessions, and shadcn-style componentized interaction patterns.

## What Changes

- Replace the flat admin navigation with grouped sections for workspace, teaching operations, activity/content operations, assessment/reporting, and system settings.
- Make the authenticated admin shell full page width without centered max-width gutters, while keeping content spacing predictable inside each view.
- Add a collapsible sidebar that can compact to an icon rail on desktop while keeping an explicit expand control reachable; mobile keeps an accessible stacked navigation.
- Add a system settings section that surfaces registration, account policy, mini program, resource domain, permissions, health, and audit configuration categories.
- Move generic resource create/edit flows out of inline page stacks and into centered modal overlays using reusable shadcn-style primitives.
- Persist authenticated admin sessions across refreshes until logout.
- Use API-backed resource lists for relationship selector options instead of mock or fabricated choices.
- Refactor admin UI into reusable layout, overlay, navigation, toolbar, and form-shell components while preserving the `/ops/*` API-only boundary.

## Capabilities

### New Capabilities

### Modified Capabilities
- `ops-admin-system`: The standalone admin UI must provide a structured, full-width, componentized operations workspace with grouped navigation, system settings, persistent sessions, live relationship selectors, and modal-based resource forms.

## Impact

- Affected code: `ikanyue.admin/src/App.tsx`, `ikanyue.admin/src/app/resourceConfig.ts`, `ikanyue.admin/src/app/types.ts`, `ikanyue.admin/src/components/ops/*`, and `ikanyue.admin/src/components/ui/*`.
- Dependencies: shadcn-style UI primitives remain local React/Tailwind components; any new npm dependency must stay inside `ikanyue.admin`.
- APIs: no direct PocketBase access from the browser; settings status can be represented from existing client state or static UI until writable settings APIs are introduced separately.
- Systems: parent repo receives only OpenSpec artifacts and submodule pointer changes; Flutter is out of scope.
