## ADDED Requirements

### Requirement: Miniapp Activity Signup Submission
The mini program SHALL allow an authenticated student to sign up for an eligible activity from the activity detail page.

#### Scenario: Authenticated student signs up
- **WHEN** a logged-in student opens an active activity detail page, enters required signup fields, and submits
- **THEN** the mini program calls the authenticated activity signup API and shows a successful registered state

#### Scenario: Anonymous student is prompted to log in
- **WHEN** an anonymous user attempts to sign up for an activity
- **THEN** the mini program does not call the signup API and prompts the user to log in through the profile flow

#### Scenario: Duplicate signup is idempotent
- **WHEN** the student submits a signup for an activity they already registered for
- **THEN** the system treats the response as already registered and keeps the activity detail in a registered state

#### Scenario: Ineligible signup is explained
- **WHEN** the API reports that the activity is ended, full, missing, or unavailable
- **THEN** the mini program shows a user-safe message and does not mark the activity as newly registered

### Requirement: Miniapp Signup History
The mini program SHALL provide a student-owned signup history page reachable from the profile surface.

#### Scenario: Student views own signups
- **WHEN** a logged-in student opens "my signups"
- **THEN** the mini program loads `/v1/activity-signup/find`, displays signup status and activity summary, and opens available activity details

#### Scenario: Anonymous user opens signup history
- **WHEN** an anonymous user opens "my signups"
- **THEN** the mini program shows an anonymous state and offers a profile/login navigation path

#### Scenario: Empty signup history
- **WHEN** the signup API returns an empty list
- **THEN** the mini program shows an empty state without treating it as an error

### Requirement: Miniapp Personal Content Hub
The mini program SHALL make reports, signups, and local material favorites discoverable from the profile surface.

#### Scenario: Profile lists personal content entries
- **WHEN** a logged-in student opens the profile page
- **THEN** the page exposes entries for assessment reports, activity signups, audio favorites, and video favorites

#### Scenario: Personal content preserves existing favorite behavior
- **WHEN** a student opens audio or video favorites from profile
- **THEN** the mini program uses the existing local favorite storage and does not require a new server-backed favorite account model

### Requirement: Miniapp Signup Runtime Verification
The mini program SHALL include repeatable verification for the signup and personal-content runtime contract.

#### Scenario: Runtime verifier covers signup loop
- **WHEN** the miniapp runtime verification script runs
- **THEN** it confirms the signup page registration, API client methods, profile entries, activity detail signup behavior, signup history behavior, and report links
