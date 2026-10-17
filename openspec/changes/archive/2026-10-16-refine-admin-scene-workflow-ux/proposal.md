## Why

The admin now has guided flows and scene workspaces, but operators still hit table-oriented decisions: project and lesson scenes begin with fragile dropdowns, raw relation tables remain prominent, and long-form editors can open inside another overlay. This change removes those remaining sources of confusion so administrators and teachers can work from intent, lock context deliberately, and edit content in a single predictable space.

## What Changes

- Replace project and lesson scene dropdown selection with a searchable scene locator that can start from operator motive, then helps them search and lock the correct project or lesson when context needs to be chosen or changed.
- Introduce a reusable scene object picker for projects, lessons, people, and locations with searchable table rows, avatars or identity cues, status, secondary details, and selected-object summaries.
- Move meaningful long-form writing into one right-side document editor sheet so editors do not stack inside resource forms or guided-flow sheets.
- Rebalance admin navigation so daily teaching and operations paths lead with scenario workspaces while raw relation resources are treated as advanced maintenance.
- Extend admin tests to verify scene locator behavior, locked context preservation, editor sheet behavior, and navigation hierarchy.

## Capabilities

### New Capabilities
- `admin-scene-workflow-ux`: Covers searchable scene location, scene object picking, single-sheet document editing, and operator-centered admin workspace hierarchy.

### Modified Capabilities
- `ops-admin-system`: Refine admin navigation and generic form overlay behavior so normal operators enter scenario workflows before raw data maintenance.
- `subproject-unit-test-coverage`: Require focused admin tests for the refined scene workflow UX.

## Impact

- Affected project: `ikanyue.admin`.
- Affected UI modules: scene workspaces, guided creation dialog, resource form overlays, shared sheet/editor/picker components, and sidebar/resource navigation.
- No backend schema migration is required.
- No Flutter work is included.
- The parent repository remains dependency-neutral; all dependency or test changes stay inside subprojects.
