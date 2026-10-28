## ADDED Requirements

### Requirement: Standalone Admin Project
The management UI SHALL be implemented as a standalone `ikanyue.admin` project using Vite, React, Tailwind CSS, shadcn-style components, and lifecycle-centered navigation, built as a static single-page app that `kanyue.server` embeds and serves on the same origin as `/ops`.

#### Scenario: Admin app remains independent
- **WHEN** the admin app is added or modified
- **THEN** it has its own package metadata, scripts, lockfile, tests, and build configuration without adding a root JavaScript workspace

#### Scenario: Server serves the admin shell
- **WHEN** a browser navigates to an admin route on the `kanyue.server` origin
- **THEN** the server returns the built `index.html` without caching and serves hashed assets with long-lived caching, and the client renders the shell

#### Scenario: Admin UI uses operations APIs
- **WHEN** the admin UI performs login, dashboard, module list, module detail, or mutation actions
- **THEN** it calls `/ops/*` APIs and does not call PocketBase directly

#### Scenario: Admin shell uses business-facing information architecture
- **WHEN** the authenticated admin shell renders navigation and page headings
- **THEN** ordinary labels use business-facing lifecycle terms and reserve internal resource terms for advanced maintenance or diagnostics

## MODIFIED Requirements

### Requirement: Institution Course Calendar Workspace
The Admin system SHALL expose a first-class institution timetable workspace that uses `kanyue.server` schedule APIs and existing lesson command services.

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
The Admin calendar SHALL delegate cancellation and rescheduling to existing versioned `kanyue.server` commands and SHALL NOT mutate PocketBase directly.

#### Scenario: Reschedule succeeds
- **WHEN** an operator submits a valid new interval from the lesson drawer
- **THEN** the existing reschedule command applies conflict checks and the calendar refreshes the affected range

#### Scenario: Reschedule conflicts
- **WHEN** the new interval conflicts or uses a stale version
- **THEN** the Admin shows a stable error, retains the current server schedule, and refreshes the lesson detail

## REMOVED Requirements

### Requirement: Standalone SSR Admin Project
**Reason**: The admin no longer server-renders; it is a static single-page app embedded in `kanyue.server`.
**Migration**: See "Standalone Admin Project".
