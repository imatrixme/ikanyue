## 1. OpenSpec And Navigation Model

- [x] 1.1 Add grouped admin navigation metadata for workspace, teaching operations, activity/content, assessment/reporting, and system settings.
- [x] 1.2 Extend admin view types and access checks for a system settings view.

## 2. Componentized Admin Shell

- [x] 2.1 Add reusable shadcn-style layout primitives for sidebar navigation, page headers, overlays, and settings panels.
- [x] 2.2 Replace the centered authenticated shell with a full-width layout and an explicit desktop collapse/expand sidebar.
- [x] 2.3 Preserve accessible mobile navigation and role-filtered menu behavior.

## 3. Resource Interaction Redesign

- [x] 3.1 Move generic resource create/edit forms into a reusable sheet/dialog overlay.
- [x] 3.2 Keep table layout stable while overlays are open and close overlays after successful saves.

## 4. System Settings Surface

- [x] 4.1 Add a system settings view with categorized panels for registration, account policy, mini program, resource domain, permissions, health, and audit visibility.
- [x] 4.2 Ensure sensitive setting categories do not expose raw secret values.

## 5. Verification

- [x] 5.1 Update focused admin tests for grouped navigation, settings access, full-width shell markers, and overlay form behavior.
- [x] 5.2 Run admin lint, tests, build, and OpenSpec validation for the change.

## 6. Usability Corrections

- [x] 6.1 Replace hover-only sidebar expansion with an explicit expand/collapse button.
- [x] 6.2 Make navigation groups independently collapsible.
- [x] 6.3 Add shadcn-style switch, select, combobox, and file picker primitives.
- [x] 6.4 Convert system settings explanatory rows into operable switch controls where appropriate.
- [x] 6.5 Convert relationship fields from raw ID inputs to searchable semantic selectors.
- [x] 6.6 Convert enum fields to localized select labels and file fields to upload-oriented controls.
- [x] 6.7 Apply shadcn-style design tokens and visual treatment across the admin shell, sidebar, cards, tables, forms, settings, and overlays.
- [x] 6.8 Update tests, run admin verification, rebuild Docker admin, and verify the local Docker panel.

## 7. Admin Precision Corrections

- [x] 7.1 Persist authenticated admin sessions across page refreshes and clear the persisted session on logout.
- [x] 7.2 Make the sidebar denser, keep the explicit collapsed-state expand button reachable, and add nested navigation sections inside large groups.
- [x] 7.3 Replace right-edge resource sheets with centered modal dialogs using balanced two-column form layout.
- [x] 7.4 Remove mock-backed relationship choices from resource forms and load relationship dropdown options from real API resource data.
- [x] 7.5 Expand student and teacher list/profile fields and allow administrators to edit both resource types.
- [x] 7.6 Avoid misleading selectable placeholder/default options when no real candidate data exists.
- [x] 7.7 Update tests, run admin verification, rebuild Docker admin, and verify the local Docker panel.
