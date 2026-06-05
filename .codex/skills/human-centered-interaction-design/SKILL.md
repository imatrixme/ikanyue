---
name: human-centered-interaction-design
description: Use when designing or reviewing admin UI, workflow UX, forms, component interactions, or product flows. Forces deep reasoning from human motivation, operator intent, understanding cost, training cost, ambiguity removal, and task completion speed before considering data models or implementation cost.
---

# Human-Centered Interaction Design

Use this skill before proposing or implementing any meaningful UI/UX, admin workflow, form, editor, dashboard, or component interaction.

## Non-Negotiable Lens

Optimize for solving the human problem. Do not start from tables, fields, components, or development cost.

- Treat implementation cost as secondary. Do not simplify the design just because it is easier to build.
- Start from the operator's situation: what they are trying to accomplish, what they already know, what they fear breaking, and what would make handoff to another operator easy.
- Reduce understanding cost, training cost, ambiguity, and accidental data damage.
- Prefer scene-specific workflows over generic CRUD when the task has a clear human motive.
- Hide database structure from normal operators. Let data tables exist as diagnostics, not as the main path.

## Required Thinking Sequence

1. **Name the human motive**
   - What brought the user here?
   - What decision or action do they want to finish?
   - What would make them feel confident they did it correctly?

2. **Identify known context**
   - What is already known from the page, route, selected object, or previous step?
   - Which fields should be locked, inherited, or implied instead of re-selected?
   - Which choices are dangerous because the user could accidentally pick the wrong parent object?

3. **Separate primary and secondary information**
   - Primary: information needed to decide or act now.
   - Secondary: helpful detail for confidence, hover, expand, or side panel.
   - Diagnostic: raw IDs, JSON, database fields, audit traces. Keep these out of the main path.

4. **Design the scene, not the table**
   - Replace relation-table editing with scene actions: join, assign, schedule, mark attendance, publish, convert, review, generate report.
   - Make the UI speak in verbs and outcomes, not collection names.
   - Use relation tables as generated results of a scene action.

5. **Choose the interaction shape**
   - Use locked context cards when parent context is already known.
   - Use role boards when assigning people to roles.
   - Use rosters when managing members.
   - Use attendance boards when recording real-world presence.
   - Use timelines when understanding sequence over time.
   - Use document editors for long-form writing; never bury core writing in a tiny field at the bottom of a form.

6. **Remove ambiguity**
   - Explain inheritance vs override.
   - Show what will be created or changed in human labels.
   - Warn before replacing, duplicating, or creating conflicting assignments.
   - Show empty states that say what to do next.

7. **Plan verification**
   - Add tests for interaction intent, not only field rendering.
   - Verify locked context cannot be accidentally changed.
   - Verify scene actions create the right underlying records.
   - Verify lookups and display views reconstruct the scene without information loss.

## Common Admin Patterns

### Context-Locked Forms

If a user opens an action from a project, session, activity, student, or teacher detail page, do not ask them to choose that object again.

Use:
- A compact locked context summary.
- Hidden or fixed payload values.
- A deliberate "change context" action only when changing is truly valid.

### People Selection

People are not IDs. Use cards or rows with:
- Avatar or fallback initials.
- Name and recognizable secondary detail.
- Status and availability.
- Existing relationship to the current scene.
- Hover or expanded details for extra information.

When many people are possible, show likely groups first: already related, from signup pool, recently active, recommended, then search.

### Relationship Tables

Do not expose relationship tables as the normal creation surface.

Examples:
- `program_students` means "join students to this project".
- `program_teachers` means "assign project teaching roles".
- `session_students` means "record this lesson's participants and attendance".
- `session_teachers` means "confirm or override this lesson's teachers".

### Long-Form Editors

If the user is writing meaningful content, give them writing space.

Use a large modal or full-screen editor with:
- Edit, preview, split preview, Markdown, and HTML modes where useful.
- Save draft, save and return, discard, and unsaved-change protection.
- Image upload integrated into the editor.
- A compact summary in the parent form instead of the whole editor buried below other fields.

## Output Expectations

When producing a design plan:
- Lead with the human scenes and operator motives.
- Explain what disappears from the UI and why.
- Define the main screen hierarchy.
- Define component responsibilities only after the scene is clear.
- Include empty, loading, error, and conflict states.
- Include testable acceptance criteria.

When implementing:
- Keep scene components named by user intent, not database tables.
- Preserve raw data centers only as secondary admin tools.
- Add focused unit tests for the new scene-level behavior.
