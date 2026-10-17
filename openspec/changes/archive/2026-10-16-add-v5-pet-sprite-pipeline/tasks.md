## 1. V5 Asset Contract

- [x] 1.1 Add project-local V5 sprite configuration and manifest data for the `sprout` `baby` `idle` vertical slice.
- [x] 1.2 Add V5 workspace paths for canonical, raw, normalized, review, and manifest outputs without adding root package metadata.

## 2. V5 Frame Generation

- [x] 2.1 Add a deterministic frame renderer for the existing Sprout Three.js rig that can render the configured idle frame sequence.
- [x] 2.2 Add a V5 build command that generates raw frames, normalized runtime frames, review strips, and V5 manifest/report data.

## 3. Runtime Integration

- [x] 3.1 Update generated pet animation manifest generation so the selected `sprout` idle action can consume V5 frames while other actions remain covered by V4 frames.
- [x] 3.2 Preserve `PetSprite` playback compatibility with metadata-driven frame clips and stable layout.

## 4. Verification And Documentation

- [x] 4.1 Add V5 validation that checks frame counts, dimensions, visible margins, alpha bounds, center drift, baseline drift, loop closure, manifest coverage, and review output.
- [x] 4.2 Update local documentation with the V5 build and validation commands.
- [x] 4.3 Run V4 and V5 asset validation plus focused type/test/build checks from `virtual-pet/`.
- [x] 4.4 Run strict OpenSpec validation for `add-v5-pet-sprite-pipeline`.
