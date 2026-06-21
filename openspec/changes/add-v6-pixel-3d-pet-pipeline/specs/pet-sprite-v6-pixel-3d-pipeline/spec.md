## ADDED Requirements

### Requirement: V6 Pixel-3D Asset Workspace
The virtual pet project SHALL provide a project-local V6 pixel-3D sprite asset workspace that separates raw Three.js renders, pixelized runtime frames, review artifacts, and V6 manifest data.

#### Scenario: V6 workspace stays project-local
- **WHEN** V6 pixel-3D sprite assets or manifests are generated
- **THEN** their source, output, and review files are created under `virtual-pet/` without adding root package metadata or modifying existing `ikanyue.*` projects

#### Scenario: V6 manifest records pixel production intent
- **WHEN** the V6 sprite build command is run
- **THEN** it records species, stage, action, frame count, source render size, pixel canvas, source renderer, palette settings, anchor, drift tolerances, review paths, and runtime output paths for each generated V6 action

### Requirement: Deterministic 3D-To-Pixel Frame Generation
The virtual pet project SHALL generate selected pet animation frames from a deterministic Three.js source renderer and convert them into low-resolution pixel-art frames suitable for runtime sprite playback.

#### Scenario: Sprout action frames render from a stable 3D source
- **WHEN** the V6 sprite build command is run from `virtual-pet/`
- **THEN** it generates configured `sprout` `baby` action frame sequences from the project-local Three.js Sprout rig using deterministic frame clocks

#### Scenario: Pixel frames use a low-resolution canvas
- **WHEN** V6 runtime frames are generated
- **THEN** each generated runtime frame uses the configured pixel canvas dimensions rather than the larger raw Three.js render dimensions

#### Scenario: Pixelization preserves transparency
- **WHEN** raw V6 frames are converted into runtime pixel frames
- **THEN** transparent background semantics are preserved so the pet can be composited over the existing habitat stage

### Requirement: Pixel-Art Review And Runtime Contract
The virtual pet project SHALL make V6 pixel-art continuity inspectable and mark V6 clips so runtime display uses pixelated rendering.

#### Scenario: V6 review strips are generated at enlarged pixel scale
- **WHEN** the V6 sprite build command completes
- **THEN** each generated V6 action has a review strip with enlarged nearest-neighbor frames and visible frame order

#### Scenario: Runtime manifest marks pixel clips
- **WHEN** the generated pet animation manifest is loaded after V6 assets are built
- **THEN** configured V6 clips expose metadata that lets the runtime display them with pixelated image interpolation

### Requirement: V6 Pixel Asset Verification
The virtual pet project SHALL verify V6 generated pixel sprite assets with deterministic project-local checks.

#### Scenario: V6 validation checks frame stability
- **WHEN** the V6 sprite validation command is run from `virtual-pet/`
- **THEN** it checks generated frame count, frame dimensions, visible margins, alpha bounds, center drift, baseline drift, loop closure, manifest coverage, and review output for each configured V6 action

#### Scenario: Missing V6 output fails validation
- **WHEN** a configured V6 runtime frame or review artifact is missing
- **THEN** the V6 sprite validation command fails with a clear error
