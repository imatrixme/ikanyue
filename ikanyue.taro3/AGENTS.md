# Repository Guidelines

## Project Structure & Module Organization
`src/app.js` bootstraps the Taro runtime and registers global styles from `src/app.scss`. Each feature lives in `src/pages/<feature>`, combining `index.vue`, `index.scss`, and an optional `index.config.js`. Co-locate reusable view pieces under `src/pages/<feature>/components` to keep imports relative and tree-shakeable. Shared static data is stored beneath `src/data`, media assets under `src/imgs`, and cross-cutting helpers or request wrappers belong in `utils`. Platform-specific build settings live in `config/dev.js`, `config/prod.js`, etc.; update these instead of inlining environment switches inside Vue files.

## Build, Test, and Development Commands
- `npm run dev:weapp` (or `dev:h5`, `dev:alipay`, …) starts the watcher for the named platform; use during feature work so CSS and config hot reload.
- `npm run build:weapp` emits a production bundle to `dist/weapp`. Always run the exact platform you plan to ship.
- `npx taro doctor` surfaces missing dependencies and config drift before committing.
- `npx eslint src --ext .js,.vue` plus `npx stylelint "src/**/*.scss"` keep code style consistent; run them locally before a PR.

## Coding Style & Naming Conventions
Follow the Taro Vue 3 Composition API pattern with 2-space indentation and single quotes in JavaScript. Favor `setup()` with explicit `ref`/`computed` exports and keep page-level state in `useXxx` utilities stored in `utils`. Name Vue files and folders using kebab-case (e.g., `video-material`), match SCSS class names to the page slug, and use BEM modifiers for NutUI components. Import dayjs for date math instead of ad-hoc helpers. When adding styles, prefer Sass variables and mixins in `app.scss` to avoid platform divergence.

## Testing Guidelines
There is no automated suite yet, so rely on targeted manual passes per page. Smoke-test primary user journeys on both WeChat devtools and H5 after each major change. When adding UI that branches per platform, capture screenshots or screen recordings and attach them to the PR. If you introduce logic-heavy helpers, add lightweight unit coverage by wiring Jest inside `src/__tests__` (see Taro docs) and reference the helper filename in the test name (e.g., `video-service.spec.js`).

## Commit & Pull Request Guidelines
Recent commits are short, action-focused statements (often in Chinese) such as “修复视频列表页面”; continue using concise, imperative summaries and scope prefixes when helpful (`视频: 修复详情跳转`). Each PR should include: 1) a short description of the change and affected pages, 2) linked work items or issue IDs, 3) manual verification notes for every platform touched, and 4) screenshots/gif evidence for UI deltas. Request at least one review when touching shared modules (`utils`, `config`, `app.*`) and check that `dist/` is excluded from diffs before submitting.
