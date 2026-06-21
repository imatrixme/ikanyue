## MODIFIED Requirements

### Requirement: Normalized Animation Asset Pipeline
The virtual pet project SHALL provide project-local asset pipelines that generate runtime pet animation frames from canonical source inputs using fixed transparent canvases and stable anchor contracts, including the existing seed-frame pipeline, the V5 deterministic source-render pipeline for selected actions, and the V6 3D-to-pixel pipeline for selected pixel-art actions.

#### Scenario: Runtime frames are generated from source seeds
- **WHEN** the pet animation build command is run from `virtual-pet/`
- **THEN** runtime animation frames are generated under the virtual pet project from project-local source seed frames without requiring root repository package metadata

#### Scenario: Runtime frames are generated from V5 source renders
- **WHEN** the V5 pet sprite build command is run from `virtual-pet/`
- **THEN** the configured V5 action generates runtime animation frames under the virtual pet project from a deterministic project-local source renderer without requiring root repository package metadata

#### Scenario: Runtime pixel frames are generated from V6 3D renders
- **WHEN** the V6 pet sprite build command is run from `virtual-pet/`
- **THEN** configured V6 actions generate low-resolution pixel-art runtime animation frames under the virtual pet project from deterministic project-local Three.js renders without requiring root repository package metadata

#### Scenario: Review strips are generated for curation
- **WHEN** the pet animation build command is run from `virtual-pet/`
- **THEN** review contact strips are generated for every configured species action so frame continuity can be inspected before runtime use

#### Scenario: V5 review strips are generated for curation
- **WHEN** the V5 pet sprite build command is run from `virtual-pet/`
- **THEN** review contact strips are generated for every configured V5 action so rendered-frame continuity can be inspected before runtime use

#### Scenario: V6 pixel review strips are generated for curation
- **WHEN** the V6 pet sprite build command is run from `virtual-pet/`
- **THEN** enlarged pixel review contact strips are generated for every configured V6 action so pixel-frame continuity can be inspected before runtime use

#### Scenario: Generated frames use fixed canvases
- **WHEN** generated runtime frames are inspected
- **THEN** every generated frame uses the configured canvas size for the animation pipeline that produced it

#### Scenario: Generated frames keep a stable anchor
- **WHEN** generated runtime frames for a species action are validated
- **THEN** the visible pet baseline and center stay within the configured drift tolerance for that action

### Requirement: Expanded Pet Action Loops
The virtual pet project SHALL generate smoother pet action loops with more frames than the original sliced frame set and SHALL allow selected V5 or V6 actions to use richer configured frame counts.

#### Scenario: Every species action has expanded frames
- **WHEN** the generated pet animation manifest is loaded
- **THEN** every configured species action exposes at least twelve runtime frames

#### Scenario: Selected V5 action has richer frames
- **WHEN** the generated pet animation manifest is loaded after V5 assets are built
- **THEN** the configured V5 action exposes the V5 configured runtime frame count without reducing other configured species actions below twelve runtime frames

#### Scenario: Selected V6 action has richer pixel frames
- **WHEN** the generated pet animation manifest is loaded after V6 assets are built
- **THEN** each configured V6 action exposes the V6 configured runtime frame count and pixel render-style metadata without reducing other configured species actions below twelve runtime frames

#### Scenario: Action metadata describes playback
- **WHEN** the generated pet animation manifest is loaded
- **THEN** every configured species action includes fps, loop behavior, duration, canvas size, and anchor metadata

### Requirement: Animation Asset Verification
The virtual pet project SHALL include project-local verification commands for generated pet animation assets, including V5 source-rendered actions and V6 pixel-3D actions.

#### Scenario: Asset validation passes for generated frames
- **WHEN** the pet animation validation command is run from `virtual-pet/`
- **THEN** it verifies expected frame counts, frame dimensions, manifest coverage, review strips, and anchor drift without requiring existing Kanyue subprojects

#### Scenario: V5 asset validation passes for source-rendered frames
- **WHEN** the V5 pet sprite validation command is run from `virtual-pet/`
- **THEN** it verifies expected V5 frame counts, frame dimensions, manifest coverage, review strips, anchor drift, and loop closure without requiring existing Kanyue subprojects

#### Scenario: V6 asset validation passes for pixel-3D frames
- **WHEN** the V6 pet sprite validation command is run from `virtual-pet/`
- **THEN** it verifies expected V6 frame counts, pixel frame dimensions, manifest coverage, review strips, anchor drift, loop closure, and pixel render-style metadata without requiring existing Kanyue subprojects

#### Scenario: Missing generated assets fail validation
- **WHEN** a manifest entry references a missing generated frame
- **THEN** the pet animation validation command fails with a clear error
