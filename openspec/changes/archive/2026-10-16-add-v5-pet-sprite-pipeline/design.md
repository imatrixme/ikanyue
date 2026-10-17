## Context

`virtual-pet/` already has a V4 frame pipeline that expands canonical source seeds into 12-frame WebP action loops, validates canvas size and anchor drift, and emits `petAnimationManifest.ts`. That solved the first obvious sprite problem, but the generated motion is still based on seed-image transforms. It cannot yet prove that a future pet action came from a stable model, stable camera, or canonical asset contract.

The user wants a deeper production approach for smoother, more natural sprite animation. Recent research favored a hybrid game-asset pipeline: canonical references plus deterministic post-processing, with Three.js/low-poly rigs used as a stable motion source where possible. The first implementation should be a vertical slice, not a full asset rewrite.

Constraints:

- Keep all package metadata, dependencies, scripts, and generated assets inside `virtual-pet/`.
- Do not require `OPENAI_API_KEY`, purchased Rive/Spine tooling, or changes to existing `ikanyue.*` projects.
- Preserve current runtime behavior while proving V5 can feed the existing metadata-driven sprite path.
- Reuse existing `three`, `sharp`, and `playwright` before adding dependencies.

## Goals / Non-Goals

**Goals:**

- Add a V5 asset workspace with canonical, raw, normalized, review, and manifest outputs.
- Define a V5 action manifest that can describe source renderer, frame count, canvas, anchor, tolerances, and runtime output paths.
- Render a deterministic `sprout/baby/idle` vertical slice from the existing Three.js Sprout rig.
- Normalize rendered PNG frames onto the existing transparent canvas and produce runtime WebP frames.
- Generate review evidence with contact strips and validation metrics.
- Wire the selected V5 action into the existing generated TypeScript runtime manifest without changing pet persistence or gameplay state.

**Non-Goals:**

- No full replacement of all species, stages, or actions in this change.
- No new pet gameplay loop, backend API, account system, inventory system, or economy.
- No external image-generation SDK, no root workspace, and no new root package files.
- No PixiJS, Phaser, Rive, Spine, Blender, or Aseprite dependency in the first V5 slice.

## Decisions

### Add V5 as an additive asset pipeline

The V5 pipeline will live alongside `frames-v4` and the existing V4 scripts. It will generate a selected action into `src/assets/pets/frames-v5/` and update the generated runtime manifest only for the selected vertical slice.

Alternatives considered:

- Replace V4 immediately: rejected because V4 is already validated and covers all species/actions.
- Keep V5 only as review output: rejected because the first slice must prove runtime compatibility.
- Add a separate player component: rejected because the current `PetSprite` metadata contract can already display frame sequences.

### Use Three.js as the first deterministic source renderer

The first V5 source will reuse the existing low-poly Sprout rig and motion code. A script will render a fixed number of frames for `sprout/baby/idle` with a deterministic clock and transparent background.

Alternatives considered:

- Independent image generation per frame: rejected because it recreates identity drift.
- Manual Aseprite-only production: useful later, but too manual for a low-cost reproducible vertical slice.
- Animated WebP only: rejected because per-frame validation and runtime metadata need individual frames.

### Keep runtime manifest compatibility

The generated TypeScript manifest remains the runtime source of truth for `PetSprite`. V5 scripts will update the same shape (`frames`, `fps`, `loop`, `durationMs`, `canvas`, `anchor`) and may add source details only in a separate V5 manifest/report.

Alternatives considered:

- Add a second runtime manifest: rejected because it would duplicate selection logic.
- Switch to atlas now: deferred because independent frame imports are already supported and easier to verify.

### Validate visual stability with metrics and review artifacts

Validation will check frame count, dimensions, alpha bounds, visible margins, center/baseline drift, and loop closure for V5 frames. Review output will include contact strips with frame numbers and enough metadata to spot motion discontinuity.

Alternatives considered:

- Pixel-perfect diff: too strict for animation.
- Human review only: too weak to prevent anchor regression.

## Risks / Trade-offs

- [Risk] Node-side Three rendering can be brittle in a headless environment. → Mitigation: use Playwright against a local Vite route if direct Node WebGL is unreliable, and keep Phase 1 limited to one action.
- [Risk] Low-poly rig output may still be less detailed than hand-cleaned pixel art. → Mitigation: treat Three as a stable motion source; later passes can pixelize or manually clean frames.
- [Risk] Updating generated runtime manifest can accidentally regress V4 coverage. → Mitigation: preserve all V4 entries except the selected V5 action and validate the full manifest.
- [Risk] V5 directories may grow quickly with raw and review artifacts. → Mitigation: commit only runtime assets and lightweight review evidence needed for verification; keep temporary raw output under ignored `tmp/` if needed.

## Migration Plan

1. Add V5 config and script structure inside `virtual-pet/scripts/pets-v5/`.
2. Add a render path for `sprout/baby/idle` that emits raw transparent PNG frames.
3. Normalize raw frames into `src/assets/pets/frames-v5/`.
4. Generate V5 review artifacts and validation report.
5. Update `petAnimationManifest.ts` generation so `sprout/idle` can consume V5 frames while other actions continue to use V4.
6. Verify with asset validation, typecheck/tests/build, and strict OpenSpec validation.
