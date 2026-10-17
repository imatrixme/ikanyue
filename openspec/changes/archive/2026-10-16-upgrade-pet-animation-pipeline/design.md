## Context

`virtual-pet/` currently renders each pet action from four PNG frames imported directly by `petFrameManifest.ts`. The frames were produced by slicing larger image sheets, so the visible pet may shift inside the canvas from frame to frame, and four frames per action are not enough for smooth idle or reaction loops.

The user wants to keep the low-cost frame-animation direction if possible, but fix the obvious weak points: too few frames and inconsistent frame alignment. The parent repository must remain dependency-neutral, and existing `ikanyue.*` projects stay out of scope.

## Goals / Non-Goals

**Goals:**

- Keep frame-based pet animation rather than adopting Rive, Spine, Three.js, or a full game engine.
- Generate smoother 12-frame action loops from canonical per-species/action seed frames.
- Normalize generated frames to a fixed canvas and stable baseline/center anchor.
- Generate contact-strip review images so frame continuity can be inspected before runtime use.
- Add metadata for fps, looping, duration, canvas size, and anchor so runtime behavior is data-driven.
- Add project-local validation that catches missing frames, wrong dimensions, and anchor drift.
- Keep all new dependencies and scripts inside `virtual-pet/`.

**Non-Goals:**

- No new pet species, backend, account system, inventory system, or economy work.
- No manual purchase-dependent toolchain such as Rive or Spine.
- No real-time Three.js rendering.
- No changes to existing `ikanyue.*` projects or root package metadata.

## Decisions

### Use generated normalized frame sequences

The pipeline will treat one canonical image per species/action as the visual seed, then generate expanded action loops under a new runtime asset directory. Every generated frame will reuse that same seed identity on the same transparent canvas and anchor contract.

Alternatives considered:
- Keep hand-maintained imports only: rejected because it leaves frame count and alignment quality undocumented.
- Animated WebP per action: smaller and simple, but poorer runtime control and harder to test per-frame alignment.
- Independent per-frame image generation: rejected because it recreates identity drift and frame-to-frame mismatches.
- Texture atlas now: useful later, but individual imports are simpler for Vite and keep this change focused.

### Use Sharp as a dev-only image processing tool

`sharp` will be installed in `virtual-pet/` as a dev dependency and used by Node scripts to read alpha bounds, composite onto a fixed canvas, generate seed-preserving motion frames, write review strips, and write optimized WebP assets.

Alternatives considered:
- Browser canvas scripts: more awkward to run in CI and harder to inspect filesystem assets.
- ImageMagick shell tooling: external environment dependency and less portable inside the project.

### Generate metadata as TypeScript

The build script will emit `src/data/generated/petAnimationManifest.ts`. The generated manifest will contain imported frame URLs plus animation metadata. This keeps Vite asset hashing working and gives TypeScript compile-time coverage for species and actions.

Alternatives considered:
- JSON manifest with public paths: simpler generation, but weaker bundler integration and path safety.
- Continue manual imports: too error-prone once each action grows to 12 frames.

### Anchor validation uses alpha bounds

The validation script will inspect each generated frame's non-transparent pixel bounds and compare adjacent frame center and bottom-baseline movement against per-action tolerances. This catches visual jumps caused by slicing drift while allowing intentional movement within configured tolerance.

Alternatives considered:
- Pixel-perfect frame diff: too strict for real animation.
- No visual validation: would fail to prevent the current quality issue from recurring.

## Risks / Trade-offs

- [Risk] Seed-preserving transforms are smoother than sliced frames, but less expressive than fully hand-drawn strips. → Mitigation: keep the source-seed and review-strip contract so manually redrawn or AI-generated whole-action strips can replace individual seeds later.
- [Risk] WebP support is required for generated runtime frames. → Mitigation: current target is modern browser/Vite; the source seed frames remain PNGs and the output format can be switched in the script if needed.
- [Risk] Bundle size may remain high with 216 generated frames. → Mitigation: generated WebP quality reduces weight, and the manifest structure can later be moved to atlases or lazy-loaded actions without changing gameplay logic.
- [Risk] Alpha-bound anchor validation can flag intentionally large movement as drift. → Mitigation: use a pragmatic tolerance and allow per-action tuning later if needed.

## Migration Plan

1. Add source-seed, review-strip, and generated-frame directories inside `virtual-pet/`.
2. Add project-local asset scripts and dev dependency.
3. Generate normalized 12-frame WebP action loops, review contact strips, and generated TypeScript manifest.
4. Update runtime types and `PetSprite` to use metadata.
5. Update tests, README, and OpenSpec tasks.
6. Verify with tests, lint, build, asset validation, and OpenSpec validation.
