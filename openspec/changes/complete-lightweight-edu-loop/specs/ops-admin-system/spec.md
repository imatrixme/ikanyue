## ADDED Requirements

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
