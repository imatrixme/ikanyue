## Why

The current V4 pet animation pipeline improved frame count and anchor validation, but it still derives motion from seed-image transforms and cannot prove that future frames come from a stable character model or canonical asset contract. The next step is a V5 vertical slice that makes sprite production reproducible from canonical pet references and a deterministic Three.js render path before scaling the approach to every species and action.

## What Changes

- Add a V5 pet sprite asset workspace under `virtual-pet/` for canonical references, raw rendered frames, normalized frames, review outputs, and V5 manifests.
- Add a project-local V5 manifest format that describes species, stage, actions, frame counts, source renderer, canvas, anchor, and validation tolerances.
- Add a deterministic Three.js offline render vertical slice for `sprout/baby/idle` that renders frame PNGs from the existing low-poly Sprout rig instead of slicing independent sprite images.
- Add V5 normalization, review, and validation scripts that keep frames on the existing fixed transparent canvas and report anchor/bounds drift.
- Keep the existing runtime manifest compatible while allowing a selected action to consume V5-generated frames.
- Keep all code, scripts, generated assets, and dependencies inside `virtual-pet/`; no root package metadata and no existing `ikanyue.*` project changes.

## Capabilities

### New Capabilities

- `pet-sprite-v5-pipeline`: Defines canonical pet sprite asset specifications, deterministic Three.js frame rendering, V5 normalization/review outputs, and focused validation for a runtime-ready vertical slice.

### Modified Capabilities

- `pet-animation-pipeline`: Extends the normalized asset pipeline with a V5 production path that can generate frames from a stable renderer and validate a selected action beyond seed-image transforms.
- `virtual-pet-system`: Allows a pet action to render from V5 generated frame assets while preserving the existing metadata-driven motion contract.

## Impact

- Affected code: `virtual-pet/scripts`, `virtual-pet/src/components/pet-three`, `virtual-pet/src/data/generated`, `virtual-pet/src/assets/pets`, and `virtual-pet/README.md`.
- APIs: project-local generated animation metadata may add optional V5 source details; existing game state and persistence APIs remain unchanged.
- Dependencies: no new root dependencies; prefer existing `virtual-pet` dependencies (`three`, `sharp`, `playwright`) for the vertical slice.
- Systems not affected: existing `ikanyue.*` projects, backend services, deployment configuration, and root package/workspace metadata.
