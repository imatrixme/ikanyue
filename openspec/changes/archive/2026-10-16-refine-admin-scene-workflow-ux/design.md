## Context

The admin interface has moved from flat CRUD toward scene workflows, but several pieces still force operators to think like database maintainers. Project and lesson workspaces select the current scene with native dropdowns; this does not scale to many projects or lessons and hides why the operator is selecting an object. Generic relation tables remain high in navigation, so new administrators may treat them as normal daily entry points. Long-form editing currently opens a document editor from inside a resource form sheet, causing overlay nesting and a cramped writing experience.

The user goal is not a cosmetic component swap. The admin should reduce training cost by aligning the UI with the human sequence: choose the work motive, locate the business object, lock context, act on that context, and inspect raw records only when needed.

## Goals / Non-Goals

**Goals:**
- Provide searchable project and lesson scene object location instead of fragile native dropdowns.
- Provide reusable object-picking primitives that show identity, status, secondary details, search, and selected summaries.
- Ensure long-form editing opens in one right-side document editor sheet, not inside another overlay.
- Demote raw relation resources to advanced maintenance while keeping them available for correction and audit.
- Cover the interaction intent with focused admin tests and OpenSpec validation.

**Non-Goals:**
- No PocketBase schema changes.
- No Hono API contract changes unless an existing admin API call already supports the needed data.
- No Flutter work.
- No root `package.json`, root lockfile, or root JavaScript workspace.
- No Flutter work and no parent-repository JavaScript workspace changes.

## Decisions

### Decision: Scene location is a searchable recovery workflow, not a dropdown

Project and lesson workspaces will provide a two-step locator when an operator needs to choose or change context:

1. Choose the operating motive, such as maintain project members, arrange teaching staff, record attendance, or confirm lesson teachers.
2. Search, filter, and select the relevant project or lesson from a table-like picker with status and context details.

This keeps the mental model available for recovery and large data sets. The selected object becomes locked context for all subsequent actions.

Alternative considered: replace dropdowns with a searchable combobox. This improves scale but still begins from "select a record" rather than "what are you here to do," so it does not reduce training cost enough.

### Decision: One scene object picker, specialized by resource

The admin will use a reusable scene object picker for projects, lessons, students, teachers, and locations. It will present rows with the most recognizable identity first, secondary facts second, and raw identifiers only in tooltip/detail surfaces. Existing `EntityPicker` behavior can be reused where it fits, but scene workspaces need stronger selected-object summaries and task-oriented empty states.

Alternative considered: keep separate bespoke pickers per workspace. That would give flexibility but increases drift and makes future scene workflows harder to maintain.

### Decision: The document editor is the only active editing sheet

Long-form summaries in resource or guided forms will request a top-level editor state from the parent. The document editor sheet opens as the active right-side editor and returns content to the originating field. The parent form stays mounted when possible, but it is not visually stacked above or below the editor.

Alternative considered: raise the editor z-index above the current form. That hides the symptom but preserves nested overlay behavior and makes closing/discard semantics ambiguous.

### Decision: Raw relation resources remain available but secondary

Navigation will keep relation tables for maintenance, audit, and recovery, but they should not be presented as normal daily teaching entry points. Scene workspaces and guided flows own the primary paths for adding project students, assigning project teachers, recording lesson attendance, and confirming lesson teachers.

Alternative considered: remove relation tables from navigation entirely. That would reduce confusion but hurt administrators who need recovery and direct inspection.

## Risks / Trade-offs

- [Risk] More interaction structure can add clicks for expert users. → Mitigation: keep locked summaries, recent/selected object promotion, and direct action buttons after context is locked.
- [Risk] Reusable pickers may become too generic. → Mitigation: accept scene-specific labels, empty states, status renderers, and action copy rather than exposing raw resource names.
- [Risk] Moving editor ownership upward can touch multiple forms. → Mitigation: introduce the editor orchestration in small components and preserve existing form payload behavior.
- [Risk] Existing tests may assert old dropdown behavior. → Mitigation: update tests to verify human intent and locked context rather than implementation widgets.
