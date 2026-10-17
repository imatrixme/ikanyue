## ADDED Requirements

### Requirement: Signup Page Logic Coverage
The mini program unit coverage SHALL include deterministic tests for activity signup and signup history page logic.

#### Scenario: Signup submission logic is covered
- **WHEN** the activity detail signup helper validates login state, required fields, duplicate responses, and API failures
- **THEN** Vitest tests cover the resulting request payloads and user-facing states without requiring WeChat DevTools

#### Scenario: Signup history mapping is covered
- **WHEN** signup history responses include empty lists, expanded activities, missing activities, and multiple statuses
- **THEN** Vitest tests cover the normalized view model and navigation URLs

### Requirement: Personal Content Entry Coverage
The mini program unit coverage SHALL include deterministic tests for profile personal-content entries.

#### Scenario: Profile personal content links are covered
- **WHEN** the profile page builds entries for reports, signups, audio favorites, and video favorites
- **THEN** tests verify the labels, login gating, and navigation targets

### Requirement: Signup API Route Coverage
The Hono unit coverage SHALL include backend routes used by the mini program signup flow.

#### Scenario: Signup route behavior is covered
- **WHEN** Node tests run for miniapp-facing activity signup APIs
- **THEN** they cover successful signup, anonymous rejection, missing fields, duplicate signup, full activity, ended activity, list, detail, cross-user detail rejection, and missing collection errors
