# Virtual Pet

A standalone React + Vite + TypeScript prototype for a local virtual pet system.

The app lets a player adopt one of multiple pet species, feed and care for the pet, watch it grow through stages, and see it weaken when hunger or health drops over time. Pet motion is implemented with imported image frames so the MVP stays independent from heavier animation tooling.

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
```

## Structure

- `src/game/`: deterministic pet state engine, elapsed-time decay, growth, and persistence helpers.
- `src/data/`: species, food, and animation-frame configuration.
- `src/components/`: adoption, care, status, species, and sprite presentation components.
- `assets-src/pets/source-seeds/`: canonical per-species/action seed frames for the pet animation pipeline.
- `assets-src/pets/review/`: generated contact strips for checking frame continuity before runtime use.
- `src/assets/pets/frames-v4/`: generated normalized runtime pet animation frames.
- `scripts/`: project-local animation build and validation scripts.
- `src/styles/`: responsive layout and animation presentation styles.

All package metadata and lockfiles live inside `virtual-pet/`; the parent repository remains dependency-neutral.
