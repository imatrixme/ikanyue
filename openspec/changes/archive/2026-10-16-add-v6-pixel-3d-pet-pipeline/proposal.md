## Why

The current Three.js Sprout render improves motion continuity, but the model still reads as rough low-poly and not as finished sprite art. A V6 3D-to-pixel pipeline can use the same deterministic rig for motion while producing finer GBA/NES/SNES-inspired pixel frames with fixed alignment and runtime-friendly frame playback.

## What Changes

- Add a V6 pixel-3D sprite workspace under `virtual-pet/` for raw Three renders, pixelized runtime frames, review strips, and manifest data.
- Add a project-local V6 manifest format that records pixel canvas size, source render size, palette, quantization/dither settings, action metadata, anchors, and validation tolerances.
- Generate a Sprout baby action set from the existing Three.js rig into low-resolution pixel frames, starting with all runtime Sprout actions: `idle`, `eating`, `play`, `clean`, `sleep`, and `weak`.
- Add pixel-art post-processing that downsamples with nearest-neighbor display intent, applies palette quantization, preserves transparent backgrounds, and keeps visible baseline/center drift within configured tolerances.
- Wire V6 frames into the existing metadata-driven `PetSprite` playback path while marking V6 clips for pixelated rendering.
- Keep all code, dependencies, generated assets, and scripts inside `virtual-pet/`; no root package metadata and no existing `ikanyue.*` project changes.

## Capabilities

### New Capabilities

- `pet-sprite-v6-pixel-3d-pipeline`: Defines the V6 3D-to-pixel sprite production path, pixel-art output contract, review artifacts, and validation for runtime-ready pet animation frames.

### Modified Capabilities

- `pet-animation-pipeline`: Extends the animation asset pipeline with V6 pixel-3D generation and validation for selected actions.
- `virtual-pet-system`: Allows selected pet actions to render from V6 pixel-3D generated frame assets while preserving the existing metadata-driven motion contract.

## Impact

- Affected code: `virtual-pet/scripts`, `virtual-pet/src/components`, `virtual-pet/src/tools`, `virtual-pet/src/data/generated`, `virtual-pet/src/assets/pets`, `virtual-pet/src/styles`, and `virtual-pet/README.md`.
- APIs: local animation metadata gains optional render style metadata for pixel clips; game state and persistence APIs remain unchanged.
- Dependencies: no new root dependencies; reuse existing project-local `three`, `sharp`, and `playwright`.
- Systems not affected: existing `ikanyue.*` projects, backend services, deployment configuration, and root package/workspace metadata.
