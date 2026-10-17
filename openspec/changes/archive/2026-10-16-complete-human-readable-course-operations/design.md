## Context

See `proposal.md` for motivation. The Admin already has good local examples of name-first student and teacher choices, but new course modules frequently render `CourseRecord` values generically or maintain relationships through raw ID inputs. Existing `ops-admin-system` specifications require semantic relationship controls, so this change fixes implementation and test drift rather than introducing a competing interaction model.

The Admin can obtain students from existing student list methods, teachers/courses/credit types from booking reference data, and course objects from existing course-resource list methods. Some operational resources still return only relationship identifiers, so views must join those records against explicitly loaded reference data. Taro already centralizes most credit labels in `courseCredits/pageLogic.js`, which is the correct boundary for learner-language changes.

## Goals / Non-Goals

**Goals:**
- Establish one deterministic Admin presentation module for localized enums, recognizable identity, money, dates, relationship summaries, and diagnostic fallbacks.
- Make reference loading explicit at workspace boundaries and pass semantic options/resolvers into reusable resource components.
- Keep names and business context stable from selection through confirmation and result rendering.
- Centralize learner-facing credit language in Taro presentation helpers and keep trace metadata secondary.
- Test pure projection logic separately from focused workflow interactions.

**Non-Goals:**
- No PocketBase collection or relation migration.
- No Hono route, authorization, ledger, settlement, or booking-state change.
- No new production or root dependency.
- No removal of audit, reconciliation, migration, or technical trace data.
- No redesign of unrelated points, rewards, reports, website, Flutter, or Nuxt surfaces.

## Decisions

1. Use explicit reference catalogs rather than implicit global fetching.
   - Each workspace loads the people and business objects required for its scene and builds stable ID-to-label maps.
   - Reusable components receive options and presentation functions through props.
   - Alternative: a global provider that eagerly loads every resource. Rejected because it couples unrelated capabilities, obscures authorization failures, and makes refresh behavior harder to reason about.

2. Add a shared deterministic presentation module in Admin.
   - The module owns enum dictionaries, identity fallbacks, relationship labels, diagnostic fallback text, and basic money/date formatting.
   - It accepts plain records and reference maps, so unit tests do not require React or API mocks.
   - Alternative: page-local label functions. Rejected because current drift was caused by inconsistent one-off rendering.

3. Extend generic course-resource metadata instead of teaching it domain APIs.
   - Resource columns can define a value formatter or option lookup.
   - Resource fields can define semantic select options, loading/empty copy, and secondary option context.
   - Structured values require an intentional renderer; the generic fallback never serializes JSON into the normal UI.
   - Alternative: replace the generic workspace with bespoke pages. Rejected because catalog configuration remains a legitimate structured maintenance surface once its relationships and values are semantic.

4. Resolve identity at the owning scene boundary.
   - Classes join member and teacher relations to student/teacher references.
   - Lessons join attendance and teacher rows to the same references and use class choices for publishing.
   - Enrollments join snapshots to student/package/class/price references.
   - Accounts and workload join read models to student, teacher, session-teacher, and lesson references.
   - Unresolved records show an explicit unavailable label and a shortened diagnostic ID, never a fabricated name.

5. Keep raw trace data in a reusable technical-details disclosure.
   - Normal rows and confirmations omit full IDs, immutable event references, and JSON.
   - Drawers can expose a separated technical section for authorized troubleshooting.
   - Migration, reconciliation, and audit views remain diagnostic-first because their human motive is investigating data correctness.

6. Treat `course credit` as an internal model and `lesson balance` as the learner's primary language.
   - Taro preserves product-specific credit-type names where they distinguish courses.
   - Generic state uses terms such as available lessons, reserved for upcoming lessons, used, returned, corrected, and expiring.
   - `batch`, `freeze`, `reverse`, `authoritative preview`, and rule version move to secondary detail or are rewritten around outcome and next action.
   - Alternative: globally rename every domain occurrence. Rejected because Admin audit and ledger diagnostics still require precise model terminology.

7. Preserve existing API payloads and identifiers.
   - Semantic controls submit the same IDs and commands as before.
   - Tests assert both readable labels and unchanged payload identity.
   - This keeps the change frontend-only and allows rollback without data migration.

## Risks / Trade-offs

- [Risk] Reference endpoints may be unavailable to a capability-limited role. → Load only references needed by an authorized workspace, retain known scene context, and render retryable errors instead of ID inputs.
- [Risk] Client-side joins can become stale after mutations. → Reload the affected workspace references after successful create/update operations and preserve existing refresh controls.
- [Risk] Large select lists may be hard to scan. → Use the existing searchable/select primitives where available, name-first labels, recognizable secondary text, and explicit empty states.
- [Risk] A missing reference can hide useful troubleshooting information. → Show a clear unresolved label and place the shortened/full identifier in technical detail.
- [Risk] Learner copy can oversimplify settlement semantics. → Keep deterministic mappings tied to the underlying status and retain precise trace information in secondary detail.
- [Risk] Existing tests encode raw-ID entry. → Replace those assertions with semantic selection while continuing to assert the unchanged submitted ID payload.

## Migration Plan

1. Add shared Admin presentation helpers and reference option builders with unit tests.
2. Upgrade generic course resources and catalog configuration to semantic relationships and localized values.
3. Upgrade classes, lessons, enrollments, accounts, student detail, and teacher workload in risk order.
4. Rewrite Taro credit presentation helpers and page/component copy, then update unit tests.
5. Run focused tests after each workspace, followed by complete Admin and Taro coverage, lint/build, strict OpenSpec validation, and browser/WeChat verification where available.
6. Roll back by reverting frontend presentation and option wiring; API payloads and persisted data require no rollback.
