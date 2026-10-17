## Why

The current pet animation works, but each action only has four frames and the frames came from sliced image sheets, which leaves visible size and anchor drift between frames. The project needs a low-cost asset pipeline that keeps frame animation while making motion smoother, aligned, and verifiable.

## What Changes

- Add a project-local animation asset pipeline that normalizes pet frames onto a fixed transparent canvas with a stable anchor.
- Generate expanded 12-frame action loops from canonical per-action seed frames so idle and reaction animations appear smoother without introducing Rive, Spine, or Three.js.
- Generate review contact strips for each species/action so frame continuity and anchor alignment can be inspected before runtime use.
- Replace ad hoc string-array animation data with metadata that includes frame URLs, fps, loop mode, duration, canvas size, and anchor.
- Add project-local validation that detects missing frames, wrong dimensions, and excessive anchor drift.
- Keep all tools, generated assets, scripts, and dependencies inside `virtual-pet/`.

## Capabilities

### New Capabilities
- `pet-animation-pipeline`: Defines normalized, smoother, metadata-driven pet animation assets and project-local verification for frame alignment.

### Modified Capabilities
- `virtual-pet-system`: Strengthens pet motion requirements from basic repeated frames to aligned, smoother, metadata-driven frame animation.

## Impact

- Affected code: `virtual-pet/src/data`, `virtual-pet/src/components/PetSprite.tsx`, project-local asset scripts, tests, and README.
- Dependencies: add a `virtual-pet/` dev-only image processing dependency for generating normalized frames.
- Assets: generated pet runtime frames move to a new normalized output directory; source seed frames and review strips remain project-local.
- Systems not affected: no existing `ikanyue.*` project changes and no root JavaScript package metadata or lockfiles.
