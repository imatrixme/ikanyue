## 1. Asset Pipeline

- [x] 1.1 Add project-local source seed, review, and generated asset directories for normalized pet animation frames.
- [x] 1.2 Add a dev-only image processing dependency and npm scripts inside `virtual-pet/`.
- [x] 1.3 Implement a build script that expands source seeds into twelve-frame WebP action loops on a fixed canvas.
- [x] 1.4 Implement generated review contact strips for frame-continuity inspection.
- [x] 1.5 Implement a validation script that checks generated frame counts, dimensions, manifest coverage, review strips, and anchor drift.

## 2. Runtime Integration

- [x] 2.1 Replace string-array animation data with generated metadata including frames, fps, loop behavior, duration, canvas size, and anchor.
- [x] 2.2 Update pet types and species configuration to use metadata-driven animations.
- [x] 2.3 Update `PetSprite` to drive playback timing from action metadata and keep frame layout stable.

## 3. Tests And Documentation

- [x] 3.1 Update unit tests for twelve-frame animation coverage and metadata completeness.
- [x] 3.2 Update project documentation with the animation build and validation commands.
- [x] 3.3 Verify root dependency neutrality and no existing `ikanyue.*` project changes are introduced.

## 4. Verification

- [x] 4.1 Run `npm run assets:pets` from `virtual-pet/`.
- [x] 4.2 Run `npm run assets:validate` from `virtual-pet/`.
- [x] 4.3 Run `npm test`, `npm run lint`, and `npm run build` from `virtual-pet/`.
- [x] 4.4 Run `openspec validate upgrade-pet-animation-pipeline --strict --no-interactive`.
