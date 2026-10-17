# ops-admin-system Specification

## Purpose
Define the teacher/admin-only operations system boundary, including the `/ops/*` API surface, standalone admin UI responsibilities, authorization model, audit requirements, and first-phase management workflows.
## Requirements
### Requirement: Dedicated Ops API Authentication
The system SHALL provide a dedicated `/ops/auth/login` flow that authenticates only verified, unblocked teachers and administrators.

#### Scenario: Teacher login succeeds
- **WHEN** a verified, unblocked teacher submits valid credentials to `/ops/auth/login`
- **THEN** the system returns an ops session token and a profile with `role` equal to `teacher` or `admin`

#### Scenario: Student login is rejected
- **WHEN** a student credential or unknown credential is submitted to `/ops/auth/login`
- **THEN** the system rejects the request without creating a student account

#### Scenario: Blocked or unverified teacher is rejected
- **WHEN** a blocked or unverified teacher submits credentials to `/ops/auth/login`
- **THEN** the system rejects the request and does not issue an ops session token

### Requirement: Role-Based Operations Authorization
The Ops API SHALL enforce server-side role, ownership, and capability checks for every management operation, including course catalog, pricing, credit, conversion, teaching, settlement, and teacher-credit actions.

#### Scenario: Teacher accesses assigned student data
- **WHEN** a teacher requests a student, class, session, attendance record, report, or teacher earning within their assignment scope
- **THEN** the system allows only the permitted teaching and personal earning view

#### Scenario: Teacher is denied unrelated student data
- **WHEN** a teacher requests a student, financial batch, conversion, report, or settlement outside their assignment and capability scope
- **THEN** the system rejects the request with an authorization error

#### Scenario: Academic operator manages teaching data
- **WHEN** an academic operator manages authorized classes, rosters, sessions, attendance, or settlement preparation
- **THEN** the system allows the operation but does not grant pricing-rule or financial-adjustment capability

#### Scenario: Administrator can manage global resources
- **WHEN** an administrator performs teacher, student, activity, material, course catalog, package, pricing, conversion, class, session, settlement, report, or audit management
- **THEN** the system allows the operation after validating references, capability, workflow state, and required confirmation

### Requirement: Standalone SSR Admin Project
The management UI SHALL be implemented as a standalone `ikanyue.admin` project using Vite, React, Tailwind CSS, shadcn-style components, lifecycle-centered navigation, and SSR-capable entrypoints.

#### Scenario: Admin app remains independent
- **WHEN** the admin app is added or modified
- **THEN** it has its own package metadata, scripts, lockfile, tests, and build configuration without adding a root JavaScript workspace

#### Scenario: SSR entry renders the admin shell
- **WHEN** the admin server entry renders an authenticated or unauthenticated route
- **THEN** it returns deterministic HTML containing the admin shell state required for hydration

#### Scenario: Admin UI uses operations APIs
- **WHEN** the admin UI performs login, dashboard, module list, module detail, or mutation actions
- **THEN** it calls `/ops/*` APIs and does not call PocketBase directly

#### Scenario: Admin shell uses business-facing information architecture
- **WHEN** the authenticated admin shell renders navigation and page headings
- **THEN** ordinary labels use business-facing lifecycle terms and reserve internal resource terms for advanced maintenance or diagnostics

### Requirement: Audit Logging
The Ops API SHALL record immutable audit logs for security-sensitive and data-changing operations, including before/after summaries for course-credit commands.

#### Scenario: Data-changing operation is audited
- **WHEN** an authorized user creates, updates, publishes, settles, reverses, extends, adjusts, submits, revokes, or deletes an operations resource
- **THEN** the system stores actor, role, action, resource type, resource id, operation id, trace id, reason, timestamp, outcome, and privacy-safe before/after metadata

#### Scenario: Rejected privileged operation is audited
- **WHEN** a user attempts a privileged operation that fails authorization or workflow validation
- **THEN** the system records a denied audit event without leaking sensitive data in the response

### Requirement: Core E2E Coverage
The operations system SHALL include end-to-end coverage for its existing lightweight workflows and the highest-risk course-credit workflows.

#### Scenario: Admin happy path is covered
- **WHEN** e2e tests run for the admin app
- **THEN** they cover login, student management, package publication, student batch detail, conversion preview, class/session creation, lesson settlement, teacher pending credit, report visibility, and share-link viewing

#### Scenario: Authorization failure path is covered
- **WHEN** e2e tests run for the admin app
- **THEN** they cover at least one teacher account being denied financial adjustment and unrelated student navigation

#### Scenario: Exception and correction path is covered
- **WHEN** e2e tests run for the admin app
- **THEN** they cover insufficient credit, duplicate command, expired release, and post-settlement correction workflows

### Requirement: Complete Lightweight Resource Management
The admin system SHALL support complete lightweight management for activities, audio materials, video materials, operation slots, activity signups, reports, and share links through `/ops/*` APIs.

#### Scenario: Resource detail is available
- **WHEN** an authorized ops user opens a supported management record
- **THEN** the API returns detail data through `/ops/:resource/:id` with only fields allowed for that resource

#### Scenario: Resource update is available
- **WHEN** an authorized ops user edits a supported management record
- **THEN** the API validates write authorization, strips blocked fields, persists allowed fields, and records an audit event

#### Scenario: Unsupported resource is rejected
- **WHEN** an ops user requests a resource outside the supported lightweight management set
- **THEN** the API rejects the request without falling through to direct PocketBase access

### Requirement: Activity Signup Operations Boundary
The Ops API SHALL expose activity signup review and status updates only through teacher/admin authorized `/ops/*` routes.

#### Scenario: Admin manages signup records
- **WHEN** an administrator lists, views, or updates activity signup records through `/ops/activitySignups`
- **THEN** the API allows the operation after validation and includes activity and student identifiers needed by the UI

#### Scenario: Non-admin write is rejected
- **WHEN** a non-admin teacher attempts to change a signup status
- **THEN** the API rejects the operation and records a denied audit event

### Requirement: Admin UI Form Coverage
The standalone admin project SHALL cover the lightweight management workflows with unit and end-to-end tests.

#### Scenario: Admin form flow is tested
- **WHEN** admin UI tests run
- **THEN** they cover creating or editing a publishable resource, reviewing signup records, opening report detail, and creating a share link

### Requirement: Program And Session Management Modules
The admin system SHALL expose operations modules for learning programs, learning sessions, program participants, and session participants through `/ops/*` APIs without direct PocketBase access from the browser.

#### Scenario: Administrator manages loose program
- **WHEN** an administrator creates, updates, lists, or opens a learning program
- **THEN** the admin UI calls `/ops/*` APIs and can manage optional planned dates, optional planned session count, status, and metadata

#### Scenario: Administrator manages actual session
- **WHEN** an administrator creates or updates a session under a program or as a standalone session
- **THEN** the admin UI can manage actual title, theme, time window, status, students, teachers, attendance, and teacher roles

### Requirement: Report Event Management
The admin system SHALL allow authorized operations users to create, list, open, and update report events scoped to programs, sessions, activities, or custom scopes.

#### Scenario: Administrator creates report event from program
- **WHEN** an administrator creates a report event for a learning program and selects a published report template
- **THEN** the system stores the event with scope, report type, lifecycle status, and template reference

#### Scenario: Assigned teacher creates session report event
- **WHEN** a teacher assigned to a session creates a report event for that session
- **THEN** the system accepts the event and records the teacher as actor

#### Scenario: Unassigned teacher is denied
- **WHEN** a teacher who is not assigned to the scoped program or session tries to create or update a report event
- **THEN** the system rejects the operation and records a denied audit event

### Requirement: Report Instance Management
The admin system SHALL allow authorized users to generate, list, inspect, publish, revoke, and audit report instances created from report events.

#### Scenario: Report event generates multiple student reports
- **WHEN** an administrator generates report instances for selected students under one report event
- **THEN** the system creates one report instance per selected recipient and displays them in the admin report instance list

#### Scenario: Report event generates teacher feedback reports
- **WHEN** an administrator generates report instances addressed to teachers
- **THEN** the admin report instance list includes teacher-recipient reports with subject, recipient, status, report type, and publication state

#### Scenario: Publish operation is audited
- **WHEN** an authorized user publishes a report instance
- **THEN** the system records actor, action, report instance id, timestamp, and outcome metadata

### Requirement: Role-Scoped Reporting Navigation
The admin UI SHALL show reporting actions according to the authenticated user's role and assignment scope.

#### Scenario: Admin sees global reporting modules
- **WHEN** an administrator opens the admin UI
- **THEN** the navigation includes learning programs, sessions, report templates, report events, and report instances

#### Scenario: Teacher sees assigned reporting work
- **WHEN** a teacher opens the admin UI
- **THEN** the reporting views are limited to assigned programs, assigned sessions, report events they can operate, and reports addressed to or created by them

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

### Requirement: Scenario Workflow Admin Surface
The standalone admin UI SHALL prioritize scenario workflow surfaces over raw resource tables for daily operations while retaining raw tables for advanced maintenance.

#### Scenario: Daily operations use scenario views
- **WHEN** an authorized operator navigates the admin shell
- **THEN** the primary operations entry includes a guided workflow workspace for scene-based actions before low-level resource maintenance

#### Scenario: Advanced resource maintenance remains available
- **WHEN** an administrator needs to inspect or correct raw operational records
- **THEN** existing resource tables remain reachable in an advanced maintenance grouping

### Requirement: Guided Creation UI Pattern
The standalone admin UI SHALL use reusable local React/Tailwind components for guided creation dialogs without adding parent repository dependencies.

#### Scenario: Guided dialog uses local components
- **WHEN** a guided creation flow is rendered
- **THEN** it uses local admin project components and dependencies declared only inside `ikanyue.admin`

#### Scenario: Browser does not access PocketBase directly
- **WHEN** a guided flow needs existing data or persistence
- **THEN** it uses `/ops/*` API clients and does not call PocketBase directly from browser code

### Requirement: Scene-First Teaching Operations
The standalone admin UI SHALL prioritize project and lesson scene workspaces for daily teaching operations while retaining raw resource tables for advanced maintenance.

#### Scenario: Teaching operators see scene entries first
- **WHEN** an authorized operator navigates teaching operations
- **THEN** project and lesson scene entries appear as primary operating surfaces before raw project, lesson, and relation maintenance tables

#### Scenario: Relation maintenance is secondary
- **WHEN** an administrator opens raw resources such as project students, project teachers, lesson students, or lesson teachers
- **THEN** the UI indicates that normal creation is better performed from the relevant project or lesson scene while still allowing advanced inspection and correction

#### Scenario: Scene vocabulary hides database names
- **WHEN** an operator performs a daily operation from a scene workspace
- **THEN** labels use business verbs such as add students, assign teachers, record attendance, and confirm lesson teachers instead of requiring operators to understand collection names

### Requirement: Context-Locked Scene Forms
The standalone admin UI SHALL prevent operators from reselecting parent objects that are already known from the current scene.

#### Scenario: Known project is not reselected
- **WHEN** an operator starts a student or teacher assignment from a selected project
- **THEN** the form locks and displays the current project while omitting a searchable project picker from the active decision fields

#### Scenario: Known lesson is not reselected
- **WHEN** an operator starts attendance or lesson-teacher confirmation from a selected lesson
- **THEN** the form locks and displays the current lesson while omitting a searchable lesson picker from the active decision fields

#### Scenario: Context can be changed only deliberately
- **WHEN** changing the locked project or lesson is valid
- **THEN** the UI exposes a deliberate change-context action separate from the normal submit flow

### Requirement: Dedicated Long-Form Editing Experience
The standalone admin UI SHALL use a dedicated editor modal for rich or long-form fields that require meaningful writing and review.

#### Scenario: Generic forms summarize long content
- **WHEN** a generic resource form includes a long-form or rich-text field
- **THEN** the form shows a summary and an edit action instead of placing a full editor at the bottom of the form layout

#### Scenario: Editor modal supports authoring and preview
- **WHEN** an operator opens the dedicated editor modal
- **THEN** the modal provides enough writing space and supports edit, preview, split preview, Markdown, and HTML review modes

#### Scenario: Long-form edits submit with the parent record
- **WHEN** an operator saves content in the editor modal and submits the parent form
- **THEN** the submitted payload includes the latest editor content without requiring a separate manual copy step

### Requirement: Refined Scene-First Admin Hierarchy
The standalone admin UI SHALL make scene workspaces and guided operations the primary path for ordinary teaching and operations work while keeping raw data resources secondary for maintenance.

#### Scenario: Operator sees scene paths before relation maintenance
- **WHEN** an authenticated teacher or administrator opens the admin shell
- **THEN** guided operations, project scene workspace, and lesson scene workspace are presented before raw project, lesson, and relation table maintenance in the teaching and operations hierarchy

#### Scenario: Relation tables explain their maintenance role
- **WHEN** an administrator opens a raw relation resource table
- **THEN** the UI labels the page as advanced maintenance and points normal creation or editing work to the relevant scene workspace

### Requirement: Non-Nested Form Editing Surfaces
The standalone admin UI SHALL avoid stacking document editor overlays inside create/edit overlays for generic resource or guided workflow forms.

#### Scenario: Form overlay delegates long-form editing
- **WHEN** a form overlay contains a long-form field
- **THEN** the field appears as a compact summary with an action that opens a single top-level document editor surface

#### Scenario: Editor close returns to the originating form
- **WHEN** the operator saves or closes the document editor
- **THEN** the originating form or guided workflow remains available with its prior short-field state preserved

### Requirement: Course Operations Management Modules
The admin system SHALL retain lightweight points and content management while adding structured modules for course catalog, packages and pricing, course-credit accounts and batches, conversion rules, classes, sessions, settlement exceptions, teacher credits, and audit.

#### Scenario: Dashboard aggregates operational data
- **WHEN** an authorized operator opens the dashboard
- **THEN** the system returns scoped counts for students, expiring credits, insufficient lesson reservations, unsettled sessions, pending teacher credits, and operational exceptions

#### Scenario: Management modules provide list and detail views
- **WHEN** an authorized user opens an operations module
- **THEN** the system provides table or list data and dialog/drawer detail through `/ops/*` APIs without direct PocketBase browser access

#### Scenario: High-risk actions use command workflows
- **WHEN** an operator requests credit extension, conversion, reversal, settlement, or teacher-credit adjustment
- **THEN** the admin uses a dedicated preview and command API instead of generic record editing

#### Scenario: Operation slots control mini program surfaces
- **WHEN** an administrator creates or updates miniapp operation slots and slot items
- **THEN** the system stores channel, placement, sorting, visibility, and target metadata for mini program consumption without granting access to private course-credit data

#### Scenario: Existing lightweight modules remain available
- **WHEN** an administrator opens points or rewards after the course modules are enabled
- **THEN** the existing points and offline physical-reward workflows remain functional

### Requirement: Appointment Operations Workspace
The Admin system SHALL provide a dedicated `/appointments` workflow for pending decisions, confirmed bookings, calendar conflicts, booking rules, teacher offerings, cancellations, and rescheduling.

#### Scenario: Operator opens appointment management
- **WHEN** an authorized operator opens `/appointments`
- **THEN** the page provides a pending queue, date and teacher filters, human-readable status summaries, calendar context, and appointment detail drawers without exposing raw relation-table editing as the primary workflow

#### Scenario: Confirmed appointment opens its lesson
- **WHEN** an operator selects a confirmed appointment
- **THEN** the interface links to the existing lesson workflow for attendance, completion, settlement, and correction

#### Scenario: Administrator handles a pending decision for the teacher
- **WHEN** an authorized academic operator confirms or declines a pending appointment from its detail drawer
- **THEN** the system performs the same guarded lifecycle transition as the assigned teacher, records the operator as the Admin actor, and never requires the client to impersonate or submit the teacher identity

### Requirement: Booking Capability and Ownership Authorization
The Ops API SHALL enforce Admin, academic capability, teacher ownership, and settlement boundaries for every booking operation.

#### Scenario: Teacher manages only their availability and requests
- **WHEN** a non-admin teacher accesses booking data through an authorized client
- **THEN** the system limits results and mutations to that teacher's offerings, availability, assigned requests, and linked lessons

#### Scenario: Academic operator manages global bookings
- **WHEN** an operator with academic capability confirms, declines, configures offerings, resolves conflicts, cancels, or reschedules an appointment
- **THEN** the system permits the action after workflow-state, version, policy, ownership, and audit validation without granting finance or settlement capability

### Requirement: Booking Policy and Offering Management
Admin SHALL configure versioned institution booking policies and explicitly enable each teacher-course offering before students can see it.

#### Scenario: Offering is disabled
- **WHEN** a teacher-course offering is draft, inactive, or references an inactive course
- **THEN** it is absent from student booking options while historical appointments remain available to authorized users

#### Scenario: Policy revision is published
- **WHEN** an administrator publishes a new booking-policy version
- **THEN** new requests use the new version and existing requests retain their snapshotted terms

### Requirement: Booking Conflict and Migration Queue
Admin SHALL surface schedule-claim conflicts, failed backfills, lost eligibility, expired requests, and notification failures as actionable operational states.

#### Scenario: Existing lessons overlap during backfill
- **WHEN** the schedule-claim migration detects overlapping future lessons
- **THEN** the system records a conflict with teacher, student, lesson, time, and suggested resolution while leaving both source lessons unchanged

### Requirement: Institution Course Calendar Workspace
The Admin system SHALL expose a first-class institution timetable workspace that uses Hono schedule APIs and existing lesson command services.

#### Scenario: Timetable is directly navigable
- **WHEN** an authorized academic operator selects the institution timetable navigation item
- **THEN** the Admin opens a URL-stable calendar workspace rather than an in-page booking subview

#### Scenario: Operator changes calendar view
- **WHEN** the operator switches among day, week, month, and list modes or changes the visible date
- **THEN** the URL preserves the view and date and the workspace requests the corresponding bounded range

#### Scenario: Operator filters the timetable
- **WHEN** the operator selects teacher, learner, class, course, status, or origin filters
- **THEN** the filters remain URL-stable and update the visible institution schedule

#### Scenario: Operator opens lesson detail
- **WHEN** the operator selects a lesson event
- **THEN** the Admin opens a detail drawer with course, participants, time, location, state, source, and existing authorized actions

#### Scenario: Narrow viewport uses readable fallback
- **WHEN** the calendar workspace is rendered on a narrow Admin viewport
- **THEN** it uses a date agenda or list presentation without overlapping controls or unreadable event labels

### Requirement: Calendar Mutation Safety
The Admin calendar SHALL delegate cancellation and rescheduling to existing versioned Hono commands and SHALL NOT mutate PocketBase directly.

#### Scenario: Reschedule succeeds
- **WHEN** an operator submits a valid new interval from the lesson drawer
- **THEN** the existing reschedule command applies conflict checks and the calendar refreshes the affected range

#### Scenario: Reschedule conflicts
- **WHEN** the new interval conflicts or uses a stale version
- **THEN** the Admin shows a stable error, retains the current server schedule, and refreshes the lesson detail

### Requirement: Teacher-Scoped Admin Calendar Access
The operations system SHALL allow a verified teacher with teacher capability to access the Admin calendar while keeping institution-wide reads and academic lesson mutations unavailable.

#### Scenario: Teacher requests the Ops calendar
- **WHEN** a teacher-only operator requests the Ops calendar for a valid range
- **THEN** the server returns only sessions assigned to the authenticated teacher with no lessons assigned solely to other teachers

#### Scenario: Teacher attempts an academic lesson command
- **WHEN** a teacher-only operator attempts to create, publish, reschedule, or cancel a lesson through an academic command
- **THEN** the server rejects the command with the existing course-credit capability error

#### Scenario: Academic operator requests the Ops calendar
- **WHEN** an academic operator requests the Ops calendar
- **THEN** the server retains the institution-wide projection and filter behavior

### Requirement: Human-Readable Course Operations
The standalone admin UI SHALL apply semantic relationship controls and business-language projections to all normal course catalog, package, enrollment, class, lesson, account, teacher-workload, booking, and calendar workflows.

#### Scenario: Operator creates or edits course data
- **WHEN** an authorized operator edits a relationship field for a course, package, price, grant rule, conversion rule, class, or lesson
- **THEN** the form uses live human-readable choices and does not require manual entry of a record identifier

#### Scenario: Operator manages a class or lesson
- **WHEN** an authorized operator manages membership, teacher assignment, publishing, attendance, settlement, or correction
- **THEN** the workspace preserves names and business context through selection, review, confirmation, and result states

#### Scenario: Operator reads a course-operation record
- **WHEN** an authorized operator opens a list, card, drawer, or confirmation for a course-operation record
- **THEN** localized status and relationship labels are primary while raw identifiers and trace metadata are secondary

#### Scenario: Diagnostic workspace remains precise
- **WHEN** an authorized operator opens migration, reconciliation, audit, or technical trace detail
- **THEN** the UI may show raw identifiers and expected-versus-actual values while clearly separating them from normal operational actions

