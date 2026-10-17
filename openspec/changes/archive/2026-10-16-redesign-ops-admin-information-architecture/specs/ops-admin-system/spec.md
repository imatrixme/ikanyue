## ADDED Requirements

### Requirement: Structured Admin Information Architecture
The standalone admin UI SHALL organize operations modules into explicit grouped sections instead of presenting all modules as one flat navigation list.

#### Scenario: Authorized user sees grouped operations sections
- **WHEN** an authorized teacher or administrator opens the authenticated admin shell
- **THEN** the navigation shows grouped sections for workspace, teaching operations, activity and content operations, assessment and reporting, and system settings, filtered by that user's role

#### Scenario: Admin-only modules remain hidden from teachers
- **WHEN** a non-admin teacher opens the authenticated admin shell
- **THEN** admin-only navigation entries such as teacher management, report template administration, audit logs, and privileged settings are hidden or inaccessible

### Requirement: Full-Width Collapsible Admin Workspace
The standalone admin UI SHALL use the full available browser width for the authenticated workspace and provide an explicitly controlled desktop sidebar that collapses to an icon rail or expands into a labeled menu.

#### Scenario: Workspace uses full page width
- **WHEN** an authenticated user opens any admin view on a desktop viewport
- **THEN** the shell, sidebar, top bar, and main content occupy the viewport width without a centered maximum-width page wrapper

#### Scenario: Sidebar expands from explicit toggle
- **WHEN** a desktop user activates the sidebar expand/collapse button
- **THEN** the sidebar switches between compact icon mode and expanded labeled menu mode while preserving the current active view state

#### Scenario: Sidebar groups collapse independently
- **WHEN** a user activates a navigation group heading
- **THEN** that group expands or collapses without changing the active view

#### Scenario: Mobile navigation remains usable
- **WHEN** an authenticated user opens the admin UI on a narrow viewport
- **THEN** navigation remains accessible without requiring hover behavior

### Requirement: Overlay-Based Resource Editing
The standalone admin UI SHALL open create and edit forms for generic management resources in reusable dialog or sheet overlays instead of stacking forms inline beneath resource lists.

#### Scenario: Create form opens in overlay
- **WHEN** an authorized user starts creating a resource from a resource list
- **THEN** the form opens in a labeled overlay and the underlying list layout remains stable

#### Scenario: Edit form opens in overlay
- **WHEN** an authorized user edits an existing resource from a resource list action
- **THEN** the form opens in a labeled overlay populated with that record and closes after a successful save

#### Scenario: Resource forms use centered modal layout
- **WHEN** an authorized user opens a generic create or edit form
- **THEN** the form appears in a centered modal dialog with balanced form columns instead of a right-edge drawer

### Requirement: System Settings Surface
The standalone admin UI SHALL provide a system settings section that groups operational configuration categories for registration, account policy, mini program configuration, resource domains, permissions, health, and audit visibility.

#### Scenario: Administrator opens system settings
- **WHEN** an administrator opens the system settings section
- **THEN** the UI shows categorized settings panels for registration, account policy, mini program, resource domain, permission, health, and audit-related configuration

#### Scenario: Sensitive settings are not leaked
- **WHEN** the system settings section references secret-backed configuration such as mini program credentials
- **THEN** the UI does not display raw secret values and instead shows non-sensitive status or configuration guidance

#### Scenario: Administrator toggles operational switches
- **WHEN** an administrator opens system settings
- **THEN** settings categories include operable switch controls for registration, account activation policy, upload-domain usage, health visibility, and audit visibility

### Requirement: Semantic Resource Forms
The standalone admin UI SHALL use semantic form controls for relationship, enum, and file fields instead of requiring operators to manually type raw IDs, English status values, URLs, or storage keys.

#### Scenario: Relationship fields use searchable choices
- **WHEN** an authorized user edits a resource with relationship fields such as program, session, student, teacher, template, activity, or target record
- **THEN** the form renders searchable selection controls with human-readable labels while preserving the stored record identifiers in submitted payloads

#### Scenario: Relationship choices come from live resource data
- **WHEN** an authorized user opens a relationship selector
- **THEN** the selector only shows records loaded from the current API-backed resources and does not expose mock or fabricated choices

#### Scenario: Empty relationship data is explicit
- **WHEN** no related records have been loaded or no related records exist
- **THEN** the relationship selector shows an empty state instead of a selectable fake default option

#### Scenario: Enum fields use localized labels
- **WHEN** an authorized user edits a resource with enum fields such as status, type, role, channel, placement, scope, report type, attendance, language, difficulty, or resolution
- **THEN** the form renders localized select options instead of raw English values

#### Scenario: File fields use upload-oriented controls
- **WHEN** an authorized user edits image, audio, or video fields
- **THEN** the form provides file upload/select controls and preview affordances rather than asking the user to manually type object keys

### Requirement: Persistent Admin Session
The standalone admin UI SHALL keep an authenticated admin session across browser refreshes until the user explicitly logs out.

#### Scenario: Refresh keeps authenticated workspace
- **WHEN** a user has successfully logged in and refreshes the page
- **THEN** the admin workspace restores the persisted token and profile without forcing another login

#### Scenario: Logout clears persisted session
- **WHEN** a user logs out
- **THEN** the persisted admin session is cleared and a later refresh shows the login screen

### Requirement: Dense Nested Sidebar Navigation
The standalone admin UI SHALL keep large navigation groups scannable through smaller typography, explicit collapse controls, and nested sections inside broad operational groups.

#### Scenario: Collapsed sidebar can always expand
- **WHEN** a desktop user collapses the sidebar
- **THEN** an explicit expand control remains visible and operable in the compact sidebar rail

#### Scenario: Large groups show nested sections
- **WHEN** the sidebar is expanded
- **THEN** broad areas such as teaching, content, and reporting can show nested section labels before their related menu items

### Requirement: Editable Student And Teacher Profiles
The standalone admin UI SHALL show useful student and teacher profile fields in management tables and allow administrators to edit both resource types.

#### Scenario: Student records expose editable profile fields
- **WHEN** an administrator opens student management
- **THEN** student rows show more than name and phone status, and editing can update core profile fields such as name, nickname, phone, avatar, birthday, gender, and blocked state

#### Scenario: Teacher records expose editable profile fields
- **WHEN** an administrator opens teacher management
- **THEN** teacher rows show profile and account status fields, and editing can update core profile, verification, blocking, and admin permission fields

### Requirement: Componentized Admin UI Primitives
The standalone admin UI SHALL implement the redesigned shell, navigation, overlays, settings panels, and resource toolbar using reusable Tailwind/shadcn-style components and a shared shadcn-style visual system.

#### Scenario: Shared UI primitives are reused
- **WHEN** the admin shell, resource list, settings view, or form overlay renders
- **THEN** common layout, overlay, button, badge, table, switch, select, combobox, file picker, and form shell behavior comes from reusable components rather than duplicated view-local markup

#### Scenario: Admin surface uses a consistent shadcn-style visual system
- **WHEN** an administrator opens dashboard, settings, resource tables, report views, or form overlays
- **THEN** those surfaces share consistent design tokens, muted/card surfaces, borders, shadows, focus rings, badges, buttons, inputs, and active navigation states instead of mixed ad hoc page-local styling
