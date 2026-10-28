## MODIFIED Requirements

### Requirement: Existing Admin contracts remain authoritative
The UI migration SHALL preserve current `/ops/*` calls, auth handling, upload routing, public MinIO image URLs returned by the API, and existing business validations.

#### Scenario: Admin tests run after a visual migration
- **WHEN** unit, E2E, and production build (`npm run build:server`) checks execute
- **THEN** current authentication, student, point, reward, upload, and redemption workflows pass without direct browser access to PocketBase or MinIO credentials
