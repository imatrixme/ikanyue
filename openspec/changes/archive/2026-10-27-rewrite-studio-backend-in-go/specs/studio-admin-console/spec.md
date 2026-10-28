## ADDED Requirements

### Requirement: Embedded Admin Console

The admin console SHALL be the existing React admin built as a static single-page app without server-side rendering, embedded in and served by `kanyue.server` on the same origin as `/ops`.

#### Scenario: One deployable
- **WHEN** `kanyue.server` is deployed
- **THEN** the admin console is available without a separate web server or container

#### Scenario: Deep link
- **WHEN** an operator opens or reloads an admin page URL directly
- **THEN** `kanyue.server` returns the console entry page and the client router shows that page

### Requirement: Complete Pages

Every page of the admin console, including points, reward items, conversion rules, teacher workload and legacy migration, SHALL be backed by `kanyue.server` endpoints with the existing permissions.

#### Scenario: Former out-of-scope page
- **WHEN** an operator opens the points or legacy migration page
- **THEN** the page loads and its actions succeed for an authorized operator
