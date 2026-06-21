## 1. V6 Pixel-3D Contract

- [x] 1.1 Add project-local V6 sprite configuration and manifest data for the Sprout baby action set.
- [x] 1.2 Add V6 workspace paths for raw renders, runtime pixel frames, review artifacts, and manifest output without adding root package metadata.

## 2. V6 Frame Generation

- [x] 2.1 Extend the deterministic Sprout frame export route so scripts can render configured actions from the Three.js rig.
- [x] 2.2 Add a V6 build command that renders raw frames, pixelizes them into fixed low-resolution runtime frames, writes review strips, and emits V6 manifest data.

## 3. Runtime Integration

- [x] 3.1 Extend generated pet animation metadata with optional pixel render-style metadata while preserving existing clip compatibility.
- [x] 3.2 Update runtime sprite presentation so V6 clips display with pixelated interpolation and stable layout.

## 4. Verification And Documentation

- [x] 4.1 Add V6 validation for frame counts, pixel dimensions, visible margins, alpha bounds, drift tolerances, loop closure, manifest coverage, and review output.
- [x] 4.2 Update local documentation with the V6 build and validation commands.
- [x] 4.3 Run V4, V5, and V6 asset validation plus focused type/test/build checks from `virtual-pet/`.
- [x] 4.4 Run strict OpenSpec validation for `add-v6-pixel-3d-pet-pipeline`.
