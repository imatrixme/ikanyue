## MODIFIED Requirements

### Requirement: Structured operations workspace
Each Admin module SHALL use a stable operations layout composed from a one-line page header (title and actions only), optional actionable summary band, filter or action toolbar, primary table or operational list, and focused detail or mutation surface. Modules that belong to one task section SHALL be reached through that section's tabs.

#### Scenario: An operator changes modules
- **WHEN** the operator chooses students, points, or rewards from primary navigation
- **THEN** the main workspace changes at the navigation level and does not simulate a new page through unrelated conditional panels inside the current module

#### Scenario: An operator inspects a record
- **WHEN** the operator opens student, point-event, or reward details
- **THEN** the details appear in an accessible dialog or drawer while the originating list remains stable

#### Scenario: An operator switches tabs within a section
- **WHEN** the operator selects the 实物 tab inside 积分
- **THEN** the URL changes to the tab route and the section stays highlighted in navigation
