## MODIFIED Requirements

### Requirement: First-Phase Information Management Modules
The admin system SHALL expose first-phase management modules for dashboard, students, teachers, activities, materials, miniapp operation slots, assessments, reports, share links, audit logs, lifecycle workspaces, and advanced data-center maintenance.

#### Scenario: Dashboard aggregates operational data
- **WHEN** an authorized teacher or administrator opens the dashboard
- **THEN** the system returns operational counts, lifecycle queues, and pending work scoped to that user role

#### Scenario: Management modules provide list and detail views
- **WHEN** an authorized user opens a first-phase module
- **THEN** the system provides list and detail data through `/ops/*` APIs without direct PocketBase access from the browser

#### Scenario: Operation slots control mini program surfaces
- **WHEN** an administrator creates or updates miniapp operation slots and slot items
- **THEN** the system stores channel, placement, sorting, visibility, and target metadata for mini program consumption

#### Scenario: Lifecycle workspaces precede raw maintenance
- **WHEN** an authorized operator uses ordinary admin navigation
- **THEN** the UI presents signup conversion, class/package, scheduling/lesson, report, student-record, and content/miniapp workspaces before advanced raw data maintenance

#### Scenario: Data center preserves advanced repair access
- **WHEN** an administrator needs to inspect or repair low-level resources
- **THEN** the UI provides a data center with raw resource tables and maintenance actions without making those tables the ordinary workflow entry point

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
