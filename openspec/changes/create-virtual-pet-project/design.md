## Context

This change introduces a new standalone browser project under `virtual-pet/`. The parent Kanyue repository currently contains several independent subprojects, and this project must not couple to or modify any existing `ikanyue.*` project.

The product goal is a low-cost virtual pet MVP: users choose from multiple pet species, feed a pet to help it grow, and see the pet become weaker if neglected. The key non-negotiable product requirement is visible pet motion. The first version can satisfy this with simple repeated image frames instead of expensive custom animation systems.

## Goals / Non-Goals

**Goals:**

- Build an independent React + Vite + TypeScript web app in `virtual-pet/`.
- Support multiple pet species through data configuration rather than hard-coded species logic.
- Model pet growth, hunger, health, mood, and time-based weakening with deterministic local logic.
- Persist pet state locally so refreshes preserve adopted pets and recent progress.
- Render visible pet motion for idle, feeding, and weak states using low-cost frame animation.
- Keep all dependencies, assets, scripts, and tests inside `virtual-pet/`.

**Non-Goals:**

- No backend service, account system, sync, payments, social sharing, or production telemetry in the MVP.
- No changes to `ikanyue.admin`, `ikanyue.taro3`, `ikanyue.mapi.hono`, `ikanyue.flutter`, `ikanyue.m.nuxt`, or existing OpenSpec capabilities.
- No root-level JavaScript workspace, root `package.json`, or root package-manager lockfile.
- No complex AI behavior, physics engine, breeding system, inventory economy, or real-time multiplayer.

## Decisions

### Use a standalone React + Vite + TypeScript subproject

The new app will live entirely in `virtual-pet/` with its own package metadata, source tree, assets, and verification commands.

Alternatives considered:
- Reuse an existing Kanyue frontend project: rejected because the user explicitly asked not to modify other projects and the virtual pet system is not part of the education/admin product surface.
- Plain static HTML: lower setup cost, but weaker maintainability for stateful pet lifecycle logic and reusable UI components.

### Store MVP data in localStorage

Pet state will be saved in browser `localStorage` with a small versioned schema. This keeps the first version playable without backend work.

Alternatives considered:
- Backend persistence: rejected for MVP cost and because it would require new API design.
- IndexedDB: unnecessary for the small state payload.

### Use a deterministic local pet engine

The app will separate UI components from a small game-state engine that computes feeding effects, growth thresholds, and elapsed-time decay from timestamps.

Key model concepts:
- `PetSpecies`: species id, display name, stage definitions, food preferences, and animation frame references.
- `PetState`: species id, stage, age/progress, hunger, health, mood, last fed time, and last tick time.
- Engine functions: adopt pet, feed pet, apply elapsed-time decay, derive visual state, and determine growth stage.

Alternatives considered:
- Keep all logic in React component state: faster initially, but harder to test and easier to regress.
- Use a game engine: unnecessary for a simple menu-driven virtual pet MVP.

### Implement animation with image frames

Each visible pet state will use a short repeated frame list or sprite sheet. The first implementation can use 2-4 frames per state and switch frame sets by pet species, growth stage, and condition.

Required state coverage:
- `idle`: the pet visibly moves while waiting.
- `eat`: feeding causes an immediate visible reaction.
- `weak`: low hunger or health renders a visibly weaker motion/state.

Alternatives considered:
- CSS-only transform animation: cheaper, but it risks making all species feel identical and does not satisfy the "can accept image frames" direction as strongly.
- Canvas animation: useful later, but unnecessary for the initial app.

### Keep species behavior config-driven

Species data will define names, growth thresholds, preferred foods, stat effects, and animation assets. The engine should not need branching per species except through these configs.

Alternatives considered:
- Hard-code three pets directly in UI: fastest for a demo, but would make "many kinds of pets" expensive to expand.

### Verify with focused project-local checks

Implementation verification will be run from `virtual-pet/` only. Expected checks include unit tests for engine behavior, a production build, and a browser smoke test for the core pet flow.

Alternatives considered:
- Run full Kanyue project test suites: unnecessary and outside scope because existing projects are not affected.

## Risks / Trade-offs

- [Risk] Image-frame assets can look unfinished if generated inconsistently across species or stages. → Mitigation: start with a small asset matrix and keep a consistent canvas size, style, and transparent background convention.
- [Risk] Real elapsed-time decay can punish users too harshly after long inactivity. → Mitigation: cap catch-up decay per app load and keep the pet recoverable through feeding.
- [Risk] localStorage schema changes can break existing saved pets during iteration. → Mitigation: version the saved state and fall back to a safe adoption state if migration fails.
- [Risk] A new subproject could accidentally add dependencies to the repository root. → Mitigation: all package files and lockfiles stay inside `virtual-pet/`, and final verification checks root dependency neutrality.
- [Risk] Animation frame loops can cause layout shifts if frames differ in size. → Mitigation: use a fixed stage container and fixed asset dimensions for each sprite frame or sprite sheet.
