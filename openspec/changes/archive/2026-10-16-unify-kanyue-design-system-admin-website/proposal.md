## Why

Kanyue's mini program, lightweight operations admin, and planned official website currently share only a partial color/token layer, so visual decisions, interaction states, and reusable patterns drift between products. A versioned cross-platform design system is needed now to preserve the selected music-ticket identity while allowing each framework to use native components and keeping the parent repository dependency-neutral.

## What Changes

- Evolve `design-system/brand-tokens.json` into a versioned token source covering foundation, semantic, component, responsive, density, layer, and shared music-ticket pattern contracts.
- Extend the token generator so the Taro mini program, React Admin, and new Nuxt website receive framework-native generated outputs without sharing runtime component code.
- Refactor the mini program's selected music-ticket implementation into a broader reusable component layer for page chrome, sections, forms, segmented controls, async states, pagination/load-more, and media presentation.
- Build a complete local Admin component system and migrate every current lightweight Admin surface to structured headers, toolbars, tables/lists, focused dialogs or drawers, and explicit loading/empty/error states.
- Create an independent `ikanyue.website` Nuxt project for the official Kanyue website, using the same token and visual contracts while adapting them to a public-facing editorial music-education experience.
- Generate multiple high-fidelity website design candidates before implementation, review them against the shared design principles, and implement the strongest candidate rather than inventing the website layout directly in code.
- Preserve current mini program and Admin business behavior, `/ops/*` boundaries, and independent subproject build/release ownership.

## Capabilities

### New Capabilities
- `unified-design-system`: Defines the cross-platform token architecture, generated platform outputs, asset contracts, reusable mini program patterns, and drift checks.
- `admin-operations-ui-system`: Defines the componentized visual and interaction system for every surface in the current lightweight Admin without restoring removed teaching-operation modules.
- `official-website-experience`: Defines candidate-led visual design, information architecture, content pages, responsive behavior, accessibility, SEO, and activity integration for the new official website.

### Modified Capabilities

## Impact

- Parent repository: OpenSpec artifacts, design token source/generator, shared visual assets, project map, and subproject pointers only; no root package metadata, lockfile, or workspace.
- `ikanyue.taro3`: generated tokens, shared components, page composition, component tests, build checks, and visual verification.
- `ikanyue.admin`: generated tokens, local React/Tailwind primitives and domain components, all current lightweight pages, tests, and visual verification.
- `ikanyue.website`: new independent Nuxt 4 / Vue 3 / TypeScript / Tailwind project with its own dependencies, tests, build, and release lifecycle.
- `ikanyue.mapi.hono`: no initial API or schema changes; the website reuses existing public activity APIs where they satisfy the published contract.
- No Docker-based validation until final release verification.
