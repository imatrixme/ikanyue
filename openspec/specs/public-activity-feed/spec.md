# public-activity-feed Specification

## Purpose
TBD - created by archiving change fix-miniapp-api-contract-drift. Update Purpose after archive.
## Requirements
### Requirement: Public activity query is literal and published-only
The public activity query SHALL only return activities whose status is `active`, SHALL match every caller-supplied filter value literally, SHALL reject invalid time bounds and SHALL only sort by whitelisted fields.

#### Scenario: Status parameter
- **WHEN** a caller passes `status=all` or any other status
- **THEN** only active activities are returned

#### Scenario: Filter operators in a value
- **WHEN** `tags`, `type`, `location` or a time bound contains quotes, `||` or `@collection` references
- **THEN** the value is matched literally (or rejected as an invalid time) and no other record or collection is queried

#### Scenario: Unpublished activity by id
- **WHEN** a caller requests an activity id whose status is not `active`
- **THEN** the API answers 404

#### Scenario: Unknown sort field
- **WHEN** `sort` names a field outside the whitelist
- **THEN** the default sort is used

