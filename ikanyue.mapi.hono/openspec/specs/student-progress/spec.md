# student-progress Specification

## Purpose
TBD - created by archiving change add-student-progress-reports. Update Purpose after archive.
## Requirements
### Requirement: Student Progress Summary
The system SHALL provide aggregated progress metrics for a student, including total lesson hours, attended sessions vs scheduled, last lesson details, and remaining hours within an optional date range.

#### Scenario: Teacher views single student progress
- **WHEN** an authenticated teacher or admin requests a student's progress with an ID and optional start/end dates
- **THEN** the API returns totals (hours learned, attendance rate, remaining hours), last lesson timestamp, and recent activity summary in the standard `code/message/data` envelope

#### Scenario: Admin lists progress with filters
- **WHEN** an admin requests a paginated list filtered by keyword (name/SN/cellphone) and date range
- **THEN** the API returns a list of students with aggregated metrics and paging metadata using the unified response schema

### Requirement: Student Progress Export
The system SHALL allow administrators to export filtered student progress data to CSV stored on S3 and return a downloadable URL.

#### Scenario: Export filtered progress data
- **WHEN** an admin submits an export request with the same filters as the summary list
- **THEN** the system generates a CSV with student identity fields, totals, attendance rate, and last activity, uploads it to S3, and returns a time-limited download URL in `data`

#### Scenario: Surface export failures
- **WHEN** export generation fails (e.g., PocketBase unavailable or file upload error)
- **THEN** the API responds with an error code (non-10000) and descriptive message without emitting a partial or stale file URL

