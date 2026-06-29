# Virtual Pet

A standalone React + Vite + TypeScript prototype for a local virtual pet system.

The app lets a player adopt one of multiple pet species, feed and care for the pet, watch it grow through stages, and see it weaken when hunger or health drops over time. Pet motion is implemented with imported image frames, plus Sprout-only Three.js render sources that can be baked into smoother standard or pixel-art sprite frames.

## Run

```bash
npm install
npm run dev
```

## Verify

```bash
npm test
npm run lint
npm run build
npm run assets:pets
npm run assets:validate
npm run assets:pets:v5
npm run assets:validate:v5
npm run assets:pets:v6
npm run assets:validate:v6
npm run assets:pets:v8
npm run assets:validate:v8
npm run assets:pets:v9
npm run assets:validate:v9
npm run assets:pets:v10
npm run assets:validate:v10
npm run assets:pets:v11
npm run assets:validate:v11
npm run assets:pets:v12
npm run assets:validate:v12
npm run assets:pets:v13
npm run assets:validate:v13
npm run assets:pets:v14
npm run assets:validate:v14
npm run assets:pets:v15
npm run assets:validate:v15
```

## Structure

- `src/game/`: deterministic pet state engine, elapsed-time decay, growth, and persistence helpers.
- `src/data/`: species, food, and animation-frame configuration.
- `src/components/`: adoption, care, status, species, frame-sprite, and Sprout low-poly Three.js presentation components.
- `assets-src/pets/source-seeds/`: canonical per-species/action seed frames for the pet animation pipeline.
- `assets-src/pets/review/`: generated contact strips for checking frame continuity before runtime use.
- `assets-src/pets/v5/`: V5 raw Three-rendered frames, review strips, and manifest data for source-rendered sprite slices.
- `assets-src/pets/v6/`: V6 raw Three-rendered frames, enlarged pixel review strips, and manifest data for 3D-to-pixel sprite slices.
- `assets-src/pets/v8/`: V8 Goldie source sheet, extracted poses, review strips, and manifest data for sheet-derived HD animation frames.
- `assets-src/pets/v9/`: V9 generated Goldie idle keyframe sheet, extracted keyframes, review strip, and manifest data for 8-keyframe-to-32-frame animation.
- `assets-src/pets/v10/`: V10 generated Goldie direct 32-frame idle sheet, extracted frames, review strip, and manifest data.
- `assets-src/pets/v11/`: V11 Agent Sprite Forge Goldie source sheet, processor output, review strip, and manifest data.
- `assets-src/pets/v12/`: V12 body-anchor-stabilized Goldie idle frames derived from the V11 Agent Sprite Forge output.
- `assets-src/pets/v13/`: V13 continuous Goldie idle loop rebuilt from the smoothest V12 stabilized frame segment with a localized blink overlay.
- `assets-src/pets/v14/`: V14 Goldie action set with per-action Agent Sprite Forge sheets, idle-aligned stabilization, and 64-frame runtime interpolation.
- `assets-src/pets/v15/`: V15 Gorest-style experimental normalization from whole raw Forge sheets, using auto grid detection, fixed fish-body anchoring, metadata, and review strips without changing runtime manifests.
- `src/assets/pets/frames-v4/`: generated normalized runtime pet animation frames.
- `src/assets/pets/frames-v5/`: generated V5 runtime frames for selected source-rendered pet actions.
- `src/assets/pets/frames-v6/`: generated V6 low-resolution pixel-art runtime frames for selected pet actions.
- `src/assets/pets/frames-v8/`: generated V8 high-fidelity runtime frames for Goldie sheet animation.
- `src/assets/pets/frames-v9/`: generated V9 runtime frames for Goldie keyframe-sheet idle animation.
- `src/assets/pets/frames-v10/`: generated V10 runtime frames for Goldie direct 32-frame sheet animation.
- `src/assets/pets/frames-v11/`: generated V11 runtime frames from Agent Sprite Forge processor output.
- `src/assets/pets/frames-v12/`: generated V12 runtime frames with deterministic body-anchor stabilization.
- `src/assets/pets/frames-v13/`: generated V13 runtime frames with continuous-segment crossfade and localized blink frames.
- `src/assets/pets/frames-v14/`: generated V14 Goldie 64-frame runtime clips from stabilized Forge action sheets.
- `scripts/`: project-local animation build and validation scripts.
- `src/styles/`: responsive layout and animation presentation styles.

All package metadata and lockfiles live inside `virtual-pet/`; the parent repository remains dependency-neutral.
