## Why

Kanyue can host a small independent interactive web project to validate a virtual pet growth loop without increasing scope in the existing education/admin/miniapp projects. The first version should be cheap to build but still feel alive: pets must visibly move, grow through feeding, and weaken when neglected.

## What Changes

- Add a new standalone `virtual-pet/` frontend project as an independent subproject under the repository root.
- Introduce a playable virtual pet MVP with multiple pet species, feed-driven growth, hunger/health decay over time, and persistent local state.
- Require visible pet animation in the MVP, implemented with simple repeated image frames or an equivalent low-cost frame loop.
- Keep all runtime dependencies, package metadata, lockfiles, assets, and tests inside `virtual-pet/`.
- Do not modify `ikanyue.admin`, `ikanyue.taro3`, `ikanyue.mapi.hono`, `ikanyue.flutter`, `ikanyue.m.nuxt`, or other existing projects.

## Capabilities

### New Capabilities
- `virtual-pet-system`: Standalone browser-based virtual pet experience with animated pets, feeding, growth, weakening, species variety, and local persistence.

### Modified Capabilities

None.

## Impact

- Future implementation creates a new `virtual-pet/` directory with its own React + Vite + TypeScript app, package metadata, local assets, and project-local verification commands.
- Parent repository remains dependency-neutral: no root JavaScript workspace, root `package.json`, or root package-manager lockfile.
- Existing Kanyue subprojects and submodules are out of scope and must not be edited by this change.
