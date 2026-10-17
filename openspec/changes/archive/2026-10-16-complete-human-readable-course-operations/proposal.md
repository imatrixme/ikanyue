## Why

Course operations have outgrown the admin's generic resource rendering: operators are still asked to recognize or type student, teacher, class, package, lesson, and credit identifiers, while learner-facing credit pages expose ledger vocabulary such as batches, freezes, reversals, and authoritative previews. These surfaces increase training cost and create avoidable confirmation risk even though earlier admin specifications already require semantic relationship controls and human-readable people.

## What Changes

- Introduce a shared frontend presentation contract for people, business objects, statuses, roles, money, dates, and diagnostic identifiers across Admin course operations.
- Replace raw relationship-ID inputs in course, package, class, lesson, enrollment, and teacher-workload workflows with searchable semantic choices backed by live reference data.
- Make names, course context, dates, and outcomes the primary content in operational lists, drawers, confirmations, attendance, settlement, and workload review; retain raw IDs only in secondary technical details.
- Extend the generic course-resource workspace so columns and fields can resolve relationships and localized values without leaking enums, objects, or JSON into normal operator paths.
- Rewrite mini-program course-credit copy around learner outcomes such as available lesson balance, reserved lessons, used lessons, returned balance, expiry, and source; keep ledger trace data behind secondary detail.
- Add focused Admin and Taro tests that reject raw-ID-first operational surfaces and verify semantic fallbacks when names or optional reference data are missing.

## Capabilities

### New Capabilities
- `human-readable-course-operations`: Defines recognizable identity, business-language projections, diagnostic-detail boundaries, and learner-facing credit terminology for Admin and mini-program course operations.

### Modified Capabilities
- `ops-admin-system`: Extends semantic resource forms and operational views so course relationships, statuses, confirmations, and lists use live human-readable projections instead of raw identifiers or backend enum values.
- `subproject-unit-test-coverage`: Requires Admin and Taro tests for presentation mappings, semantic relationship controls, diagnostic fallbacks, and human-readable course-credit states.

## Impact

- Affects `ikanyue.admin` course-operation components, reference loading, shared presentation helpers, and tests.
- Affects `ikanyue.taro3` course-credit pages, presentation helpers, components, and tests.
- Updates OpenSpec artifacts in the parent repository.
- Does not change PocketBase schema, Hono authorization, ledger semantics, API routes, root JavaScript dependencies, or production dependencies.
