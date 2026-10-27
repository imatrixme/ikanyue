## ADDED Requirements

### Requirement: Embedded Admin Console

The admin console for the studio booking scope SHALL be a Svelte single-page app built with Vite, styled only with design tokens generated from `design-system/brand-tokens.json`, and embedded in and served by `kanyue.server` on the same origin as `/ops`.

#### Scenario: One deployable
- **WHEN** `kanyue.server` is deployed
- **THEN** the admin console is available without a separate web server or container

### Requirement: Scoped Pages With Founder-Focused Navigation

The console SHALL cover today, students, booking (calendar, appointments, offerings), billing (orders, enrollments), settings (venues, courses, packages and prices) and, under a collapsed 更多, teaching, ledger and advanced booking rules, keeping the existing founder-focus navigation and role permissions.

#### Scenario: Out-of-scope page
- **WHEN** an operator needs points, legacy migration or teacher workload during the transition
- **THEN** the old admin still provides them with the same ops login

### Requirement: Console Parity Before Switch

The admin domain SHALL switch to the embedded console only after every in-scope page exists there with the same permissions and actions as the old admin.

#### Scenario: Switch day
- **WHEN** the admin domain switches to the embedded console
- **THEN** every in-scope task the founder did yesterday can be done in the new console
