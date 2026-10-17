## ADDED Requirements

### Requirement: Canonical V5 Sprite Asset Workspace
The virtual pet project SHALL provide a project-local V5 sprite asset workspace that separates canonical references, raw generated frames, normalized runtime frames, review artifacts, and V5 manifest data.

#### Scenario: V5 workspace stays project-local
- **WHEN** V5 sprite assets or manifests are generated
- **THEN** their source, output, and review files are created under `virtual-pet/` without adding root package metadata or modifying existing `ikanyue.*` projects

#### Scenario: V5 manifest records production intent
- **WHEN** the V5 sprite build command is run
- **THEN** it records the species, stage, action, frame count, source renderer, canvas, anchor, drift tolerances, and runtime output paths for each generated V5 action

### Requirement: Deterministic Three Render Vertical Slice
The virtual pet project SHALL provide a deterministic V5 render path for at least one pet action using a stable Three.js source renderer instead of independently sliced image frames.

#### Scenario: Sprout idle frames render from a stable source
- **WHEN** the V5 sprite build command is run from `virtual-pet/`
- **THEN** it generates a `sprout` `baby` `idle` frame sequence from the project-local Three.js Sprout rig using a deterministic frame clock

#### Scenario: Rendered frames use transparent canvas input
- **WHEN** raw V5 frames are produced by the Three.js render path
- **THEN** each raw frame preserves transparent background semantics suitable for normalization into runtime pet frames

### Requirement: V5 Frame Normalization And Review
The virtual pet project SHALL normalize V5 raw frames into runtime frames and generate review artifacts that make animation continuity inspectable.

#### Scenario: V5 runtime frames use configured dimensions
- **WHEN** V5 runtime frames are generated
- **THEN** each generated runtime frame uses the configured canvas dimensions and fixed anchor contract

#### Scenario: V5 review strip is generated
- **WHEN** the V5 sprite build command completes
- **THEN** a review strip for the generated V5 action is available with visible frame order so continuity can be inspected before runtime use

### Requirement: V5 Asset Verification
The virtual pet project SHALL verify V5 generated sprite assets with deterministic project-local checks.

#### Scenario: V5 validation checks frame stability
- **WHEN** the V5 sprite validation command is run from `virtual-pet/`
- **THEN** it checks generated frame count, frame dimensions, visible margins, alpha bounds, center drift, baseline drift, and loop closure for the configured V5 action

#### Scenario: Missing V5 output fails validation
- **WHEN** a configured V5 runtime frame or review artifact is missing
- **THEN** the V5 sprite validation command fails with a clear error
