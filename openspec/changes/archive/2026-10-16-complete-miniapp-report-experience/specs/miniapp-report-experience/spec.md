## ADDED Requirements

### Requirement: Student Report Discovery
The mini program SHALL provide a logged-in student-facing entry for viewing the student's own assessment reports.

#### Scenario: Logged-in student opens report history
- **WHEN** a logged-in student opens the report entry from the mini program profile area
- **THEN** the mini program displays that student's report list sorted by newest report first

#### Scenario: Anonymous student is prompted to log in
- **WHEN** an anonymous user opens the report history entry
- **THEN** the mini program prompts for login instead of calling authenticated report APIs

#### Scenario: Empty report history is understandable
- **WHEN** a logged-in student has no available report snapshots
- **THEN** the mini program displays an empty state explaining that no reports are available yet

### Requirement: Rich Report Rendering
The mini program SHALL render assessment reports using the privacy-safe report payload, including summary, scores, section details, comments, and recommendations when present.

#### Scenario: Shared report renders rich content
- **WHEN** a valid share token opens an assessment report
- **THEN** the report page displays title, student name, teacher name, generated date, total score, grade, summary, sections, comments, and recommendations available in the payload

#### Scenario: Student-owned report renders rich content
- **WHEN** a logged-in student opens one of their own reports
- **THEN** the report page renders the same privacy-safe report content without requiring a share token

#### Scenario: Invalid or revoked share token is handled
- **WHEN** a malformed, expired, revoked, or unknown share token is opened
- **THEN** the mini program displays a report-unavailable state without exposing internal identifiers

### Requirement: Resilient Operation Slots
The mini program home page SHALL load public operation slots independently from the activity list so one failing source does not break the other.

#### Scenario: Activity list fails but operation slots load
- **WHEN** the activity-list request fails and the operation-slot request succeeds
- **THEN** the home page still displays available operation-slot navigation entries and a retry state for activities

#### Scenario: Operation slots fail but activities load
- **WHEN** the operation-slot request fails and the activity-list request succeeds
- **THEN** the home page displays activities and static navigation entries without blocking the user

#### Scenario: Operation slot target is unsupported
- **WHEN** an operation slot has an unsupported or incomplete target
- **THEN** the mini program omits that slot from navigation rather than rendering a broken entry

### Requirement: Mini Program Runtime Verification
The change SHALL include repeatable verification for key mini program runtime paths affected by report discovery, report rendering, and operation-slot navigation.

#### Scenario: Runtime paths are verified
- **WHEN** implementation is complete
- **THEN** verification covers home operation-slot display, operation-slot navigation, report history entry, shared-token report opening, invalid-token handling, and student-owned report opening

#### Scenario: WeChat runtime constraints are respected
- **WHEN** report and operation-slot pages are built for WeChat mini program
- **THEN** navigation URLs, page registration, network calls, and rendered text fit Taro/WeChat mini program constraints
