## 1. Project Setup

- [x] 1.1 Create the standalone `virtual-pet/` React + Vite + TypeScript project without adding root package metadata or a root lockfile.
- [x] 1.2 Add project-local scripts for development, build, tests, and lint or type checks inside `virtual-pet/package.json`.
- [x] 1.3 Establish the source layout for app composition, pet data, engine logic, persistence, components, styles, and pet animation assets.

## 2. Pet Data And Engine

- [x] 2.1 Define config-driven pet species data with at least three species, growth stages, food preferences, stat rules, and animation frame references.
- [x] 2.2 Implement pet state types and engine functions for adoption, feeding, growth progression, elapsed-time decay, weak-state derivation, and stat clamping.
- [x] 2.3 Implement versioned localStorage persistence with safe fallback for missing, corrupt, or unsupported saved state.
- [x] 2.4 Add unit tests for feeding updates, stage transitions, inactivity weakening, weak-state derivation, mature-stage behavior, and corrupt-state recovery.

## 3. Animated Pet Interface

- [x] 3.1 Build the adoption screen with at least three selectable pet species and clear species identity.
- [x] 3.2 Build the main care screen with animated pet display, current stage, hunger, health, mood, growth progress, and visible feeding controls.
- [x] 3.3 Add frame-based animation for healthy idle, feeding reaction, and weak state without layout shifts.
- [x] 3.4 Implement periodic ticking and refresh-time catch-up decay so pets weaken gradually when not fed.
- [x] 3.5 Ensure desktop and mobile-sized layouts keep the pet, stats, and controls readable without overlap.

## 4. Project-Local Verification

- [x] 4.1 Run the virtual pet unit tests from `virtual-pet/` and record the command used.
- [x] 4.2 Run the virtual pet production build from `virtual-pet/` and record the command used.
- [x] 4.3 Run a browser smoke test confirming initial adoption, visible idle motion, feeding animation feedback, growth progress changes, saved-state restore, and deterministic weak-state rendering.
- [x] 4.4 Confirm the change-owned diff only adds or changes `virtual-pet/` and `openspec/changes/create-virtual-pet-project/`, with no edits to existing `ikanyue.*` projects and no root JavaScript package files. The pre-existing dirty `ikanyue.admin` submodule state remains outside this change.
- [x] 4.5 Run `openspec validate create-virtual-pet-project --strict --no-interactive`.
