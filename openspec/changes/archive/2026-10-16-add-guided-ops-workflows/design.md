## Context

Kanyue's admin UI now has the data primitives needed for lightweight teaching operations: activities, learning programs, sessions, participant joins, report events, and report instances. The current daily workflow still exposes those primitives directly, so operators must translate human goals into table-by-table edits and remember which relations must be created in which order.

The next admin step is an interaction model change. Operators should start from human intent, answer a small set of concrete questions, and let the system derive the low-level records. Time, place, and people must be explicit in every guided flow because those are the operational facts staff need to confirm.

## Goals / Non-Goals

**Goals:**
- Introduce scenario-first admin entry points for activities, signups, classes, lessons, attendance, and report launches.
- Add a reusable guided creation dialog with a left vertical stepper and focused right-side fields.
- Ensure guided flows explicitly collect or mark as pending purpose, participants, time, place, responsible people, rules, and generated results.
- Present data redundantly through business scene views while keeping raw resource tables as advanced maintenance.
- Keep the first implementation inside `ikanyue.admin` by reusing existing resource APIs where possible.
- Add focused unit tests and coverage for guided flow definitions, default derivation, operation planning, and UI interactions.

**Non-Goals:**
- No Flutter implementation.
- No root JavaScript workspace, root `package.json`, or root lockfile.
- No replacement of PocketBase or direct browser access to PocketBase.
- No full scheduling optimization, automatic teacher assignment, payment, refunds, or CRM automation.
- No removal of existing raw resource views; they remain available for maintenance.

## Decisions

1. Use scenario workflows as the primary admin creation surface.
   - Rationale: staff think in actions such as publishing a signup activity or opening a class, not in `learning_programs` and join tables.
   - Alternative considered: keep resource tables and improve labels. This lowers implementation effort but preserves the core confusion because users still need to assemble relations manually.

2. Implement a generic guided dialog before specialized per-flow pages.
   - Rationale: the same interaction shape works across activities, classes, lessons, attendance, and reports: left stepper, right focused fields, footer navigation, final generated-record summary.
   - Alternative considered: build custom forms for every flow. This would create faster first screens but duplicate validation, navigation, summaries, and tests.

3. Require every flow to make time, place, and people explicit.
   - Rationale: uncertain operations are valid, but uncertainty must be visible as "pending" or "to be assigned"; silently empty fields cause scheduling and staffing errors.
   - Alternative considered: only require fields when the underlying table requires them. This mirrors persistence constraints rather than operational reality.

4. Keep first implementation client-planned and resource-API-backed.
   - Rationale: the current `/ops/resources/*` APIs can create individual records and are already covered by authorization/audit paths. A client-side plan preview can show generated operations while later backend workflow endpoints are designed.
   - Alternative considered: add backend workflow endpoints immediately. This is cleaner long-term, but it expands migration and authorization scope before the UX is validated.

5. Use scene-based redundant views over raw-table-first navigation.
   - Rationale: the same record should appear where it is meaningful: a student can be in signup processing, a class, a lesson attendance list, and a report queue. This is UI redundancy, not duplicated source data.
   - Alternative considered: one canonical table per data type. This is technically neat but makes daily operations slower and less comprehensible.

## Risks / Trade-offs

- [Risk] Client-side planned operations diverge from future backend workflow behavior -> Mitigation: keep plan generation in pure functions with tests and name it as a planning layer; backend workflow endpoints can later reuse the same contract.
- [Risk] A generic guided dialog becomes too abstract -> Mitigation: flow definitions use human labels, scenario-specific step copy, and generated-result summaries rather than database field names.
- [Risk] Scene views over-promise workflow automation -> Mitigation: first version clearly separates "planned/generated result" previews from persisted raw resource maintenance.
- [Risk] Raw data maintenance becomes hard to find -> Mitigation: keep it grouped under an explicit advanced maintenance section in navigation.
- [Risk] Coverage gates become brittle with UI-heavy tests -> Mitigation: test pure planning logic separately and use focused interaction tests for the dialog and scene view.

## Migration Plan

1. Add OpenSpec requirements and tasks for guided operations.
2. Add admin workflow definitions, pure planning logic, and unit tests.
3. Add reusable guided dialog and scene workspace components.
4. Add a scenario workflow navigation entry while retaining existing raw resource views.
5. Run admin unit tests, coverage, build, lint, and OpenSpec validation.
6. Rollback by removing the guided workflow route/components; raw resource views remain unchanged.

## Open Questions

- Whether the first production auto-persistence should be performed by client-orchestrated resource calls or a new backend `/ops/workflows/*` endpoint.
- Which automatic class-splitting rules should be enabled first: by capacity, age, level, selected time slot, or manual review.
- Whether activity signup forms need customizable per-activity fields in the first guided version or only fixed minimal fields.
