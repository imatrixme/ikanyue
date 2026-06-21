## Context

`virtual-pet/` currently has three animation paths:

- V4 expands seed images into normalized WebP frame loops for all species/actions.
- V5 renders a Sprout baby idle slice from a deterministic Three.js source and normalizes it into frame assets.
- A Sprout-only runtime Three.js prototype supports smoother procedural motion and mouse rotation, but the visible model is not yet detailed enough to replace sprite art.

The user wants a 3D pixel-art version with a finer console-era feel, closer to polished GBA/NES/SNES sprite work than a rough low-poly render. The practical route is to keep Three.js as a deterministic motion source, then convert frames into a constrained low-resolution pixel-art output that the runtime plays as ordinary frame sprites.

Constraints:

- Keep all package metadata, dependencies, scripts, and generated assets inside `virtual-pet/`.
- Do not require `OPENAI_API_KEY`, paid Rive/Spine tooling, Blender, Aseprite, or root package files.
- Do not modify existing `ikanyue.*` projects.
- Preserve existing V4 coverage and V5 assets while proving V6 as an additive production path.
- Keep generated runtime frames metadata-driven so `PetSprite` remains the common player.

## Goals / Non-Goals

**Goals:**

- Add a V6 pixel-3D asset workspace and manifest under `virtual-pet/`.
- Render Sprout baby frames from the deterministic project-local Three.js rig for all current actions.
- Convert raw Three renders into low-resolution pixel-art frames using transparent-background-aware post-processing.
- Use a fixed pixel canvas, fixed anchor, and strict validation to prevent frame drift.
- Generate review strips at enlarged nearest-neighbor scale so pixel motion continuity is inspectable.
- Mark V6 runtime clips so CSS displays them with pixelated interpolation.
- Verify the generated assets, runtime manifest, tests, lint, typecheck, build, and OpenSpec change.

**Non-Goals:**

- No full replacement of Mochi/Pebble or all growth stages in this change.
- No user-facing pixel/3D style selector yet.
- No runtime-only pixel shader as the production path.
- No external art tool dependency or asset-generation SDK.
- No gameplay, economy, account, inventory, backend, or persistence changes.

## Decisions

### Generate runtime sprites from 3D, not realtime pixel-shaded 3D

V6 will render deterministic Three.js frames offline, then play low-resolution WebP frames at runtime.

Alternatives considered:

- Realtime pixel-shaded Three.js: rejected for the first production slice because it adds screen-scale, antialiasing, interaction, and performance variability.
- Hand-drawn pixel frames only: rejected for this slice because it does not solve motion/identity drift cheaply.
- Independent image generation per frame: rejected because it reintroduces character and anchor inconsistency.

### Use a low-resolution pixel canvas as the runtime source of truth

The V6 runtime frames will be generated at `160x160` and displayed with `image-rendering: pixelated`. Raw source renders can remain `640x640` for stable capture and controlled downsampling.

Alternatives considered:

- Export `640x640` pixelated frames: rejected because it hides the true pixel grid and can blur or compress the style.
- Export very small `64x64` frames: rejected because the requested level is closer to detailed GBA/SNES-era sprite work than sparse NES iconography.

### Quantize and outline during post-processing

The post-processing stage will trim the raw render into a fixed low-resolution canvas, quantize colors to a constrained palette, apply mild ordered dithering, and add pixel-outline/shadow treatment where alpha permits. This makes the output read as deliberate pixel art instead of a merely downscaled 3D screenshot.

Alternatives considered:

- Plain nearest-neighbor resize only: too weak; the result still reads as shrunk 3D.
- Heavy posterization without outline: loses sprite readability on the habitat background.
- Hand cleanup in Aseprite: useful later, but not part of the low-cost reproducible slice.

### Keep V6 additive and metadata-driven

V6 will write `src/assets/pets/frames-v6/` and update the generated runtime manifest only for selected Sprout actions. V4 remains the fallback for other species/actions. The clip metadata gains an optional `renderStyle` so UI can choose pixelated rendering without hardcoding file paths.

Alternatives considered:

- Add a second runtime manifest: rejected because it duplicates selection logic.
- Replace the entire manifest shape: rejected because game/data code already works with the current clip contract.

## Risks / Trade-offs

- [Risk] Automated pixelization may still be less refined than hand-authored pixel art. → Mitigation: generate review strips and keep V6 as an additive slice that can later be hand-cleaned or expanded.
- [Risk] Validation based on alpha bounds may flag intentional high-motion actions such as `play`. → Mitigation: allow per-action drift tolerances while keeping fixed dimensions and visible margins strict.
- [Risk] `PetSprite` metadata extension could affect all clips. → Mitigation: make `renderStyle` optional and default existing V4/V5 clips to normal frame rendering.
- [Risk] More generated frames increase bundle size. → Mitigation: keep V6 scoped to Sprout baby action slices and use WebP output.
- [Risk] V5/V6 script duplication can grow. → Mitigation: keep the V6 script modular enough to extract common helpers later, but do not broaden this task into a shared pipeline refactor.

## Migration Plan

1. Add V6 config, build, and validation scripts under `virtual-pet/scripts/pets-v6/`.
2. Extend the Sprout frame export tool so scripts can request raw deterministic frames for any action.
3. Generate raw Three frames, pixelized runtime frames, review strips, and V6 manifest data.
4. Extend runtime animation metadata with optional `renderStyle` and have `PetSprite` expose it as a data attribute.
5. Update tests, validation scripts, and README for V6 commands.
6. Run V4/V5/V6 asset validation, test, lint, typecheck, build, and strict OpenSpec validation.
