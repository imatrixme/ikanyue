## MODIFIED Requirements

### Requirement: Policies are schema-described plugins bound at defined levels
The gateway SHALL implement policies as plugins that declare a JSON Schema for their configuration and are compiled at release time, and SHALL bind them only through the policy layers of the `api-policy-sets` capability (platform baseline, group default policy set, API policy set, API overrides, application settings) with a deterministic execution order by priority.

#### Scenario: Console renders a form from the schema
- **WHEN** an operator adds a plugin to a policy set or an API override
- **THEN** the console shows a form generated from the plugin schema and rejects values the schema does not allow

#### Scenario: API override replaces the group's policy
- **WHEN** the same override-kind plugin is configured in the group's default policy set and in an API's overrides
- **THEN** the API's configuration applies to that API
