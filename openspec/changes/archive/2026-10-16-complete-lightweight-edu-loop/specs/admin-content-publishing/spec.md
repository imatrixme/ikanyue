## ADDED Requirements

### Requirement: Admin Resource Editing
The admin UI SHALL provide practical create/edit forms for lightweight publishable resources instead of only creating placeholder records.

#### Scenario: Admin edits an activity
- **WHEN** an administrator creates or edits an activity in the admin UI
- **THEN** they can provide title, status, type, location, start/end time, price, participant limit, sequence, cover/image metadata, and description required by the mini program detail page

#### Scenario: Admin edits audio material
- **WHEN** an administrator creates or edits an audio material record
- **THEN** they can provide title, status, type, author, language, difficulty, sequence, cover/file metadata, and description fields consumed by the mini program

#### Scenario: Admin edits video material
- **WHEN** an administrator creates or edits a video material record
- **THEN** they can provide title, status, type, author, language, difficulty, resolution, sequence, cover/file metadata, and description fields consumed by the mini program

#### Scenario: Admin edits operation slot
- **WHEN** an administrator creates or edits a miniapp operation slot
- **THEN** they can provide channel, placement, title, status, sort order, visibility dates, image URL, and target metadata used by the mini program home surface

### Requirement: Admin Publish Controls
The admin UI and Ops API SHALL make publish states explicit for content shown to the mini program.

#### Scenario: Draft content is not public
- **WHEN** an activity, material, or operation slot is saved as draft
- **THEN** miniapp-facing list APIs do not include it in default public listings

#### Scenario: Published content appears in miniapp
- **WHEN** an administrator changes content to `active` or `published` as appropriate for its resource type
- **THEN** miniapp-facing list APIs can include it in default public listings

### Requirement: Admin Signup Review
The admin system SHALL expose activity signup records through `/ops/*` for authorized operations users.

#### Scenario: Admin reviews signups
- **WHEN** an administrator opens signup review
- **THEN** the UI lists signup records with student, activity, status, real name, age, and created time

#### Scenario: Teacher reads scoped signups
- **WHEN** a teacher opens signup review
- **THEN** the API returns only signups the teacher is authorized to inspect or rejects access according to server-side authorization

#### Scenario: Signup status can be updated
- **WHEN** an administrator updates a signup status
- **THEN** the API persists the new status and records an audit event

### Requirement: Admin Report Detail and Share
The admin system SHALL allow authorized users to inspect report details and create or revoke share links without leaving the ops UI.

#### Scenario: Admin opens report detail
- **WHEN** an authorized user opens a report from the admin reports view
- **THEN** the UI renders score, grade, student/teacher summary, sections, comments, recommendations, and generated time

#### Scenario: Admin creates report share link
- **WHEN** an authorized user creates a share link for a report
- **THEN** the UI shows the share token or share URL and the API stores the share link without exposing token hashes
