# ikanyue.admin

React + TypeScript + Vite admin for the WeChat points-lite hard fork.

This branch intentionally keeps only:

- ops login / registration / forced password change
- admin student point balance lookup
- admin point grants
- admin offline reward redemption
- reward item catalog management

It does not ship the older teaching operations, assessment, report, resource, shipping, or refund workflows.

## Local real-backend testing

The Vite development server proxies `/ops` to `KANYUE_LOCAL_API_ORIGIN` (default `http://127.0.0.1:1337`). The normal E2E suite keeps using the in-memory API; the live suite requires the parent local environment and seeded PocketBase data. Reward images are uploaded as multipart data through Hono; the browser never receives PocketBase superuser or MinIO credentials. Returned image URLs point at the configured public asset base in production and PocketBase `/api/files` in the local environment.

```bash
npm run dev -- --port 4173
PLAYWRIGHT_LIVE=true npm run test:e2e:live
```

## Docker

The production image serves the built admin app with Nginx. `/ops/*` is proxied to the Hono service name used by the parent Compose stack.

Do not use Docker as the normal development verification loop for this fork. Run Docker only for final release verification.

```bash
docker build \
  --build-arg VITE_OPS_API_BASE=/ops \
  --build-arg VITE_OPS_API_MOCK=false \
  -t openregistry.local/ikanyue/admin:latest .
```

In production this image is expected to be pushed to OpenRegistry and run by the parent repository's `compose.yaml` through 1Panel.

## Vite notes

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
