# Project Context

## Purpose
Backend rewrite of the legacy Sails.js 看粤语 API using Hono.js. Provides a compatible REST layer for the mobile/web apps to manage users (students/teachers/admins), activities, lesson records, attendance, and media materials while keeping the original response contract.

## Tech Stack
- Node.js (primary runtime) with optional Bun entrypoint
- Hono 3 for HTTP routing plus a custom chainable route builder
- PocketBase as the data store/auth backend (admin auth via `_superusers`)
- JWT-based auth (`jsonwebtoken`, custom helper in `utils/jwtAuth.js`)
- dayjs, await-to-js utilities; dotenv for env loading per environment
- WeChat mini-program integration (`jscode2session`, phone decrypt) via `utils/wechat.js`
- Swagger JSON/serving scripts for API docs

## Project Conventions

### Code Style
- CommonJS modules, linted via ESLint (4-space indent, single quotes, required semicolons, no-unused-vars warns)
- `.prettierrc` exists (2-space tabWidth) but lint rules take precedence; follow ESLint formatting when in doubt
- Keep response helpers (`c.data/c.error/c.success`) from `middleware/response` for consistent payload shape
- Prefer descriptive handler names per route file (e.g., `userLoginHandler`)

### Architecture Patterns
- `src/app.js` boots Hono, applies global response middleware, registers routes via `bonelayer/router`
- Custom route builder (`utils/routeBuilder`) provides chainable `.auth/.teacher/.admin/.when` APIs, group inheritance, and automatic `finalize()`
- Business routes live under `src/routes/<domain>/` with an `index.js` wiring handlers and middlewares
- PocketBase client singleton (`utils/pocketbase`) handles env-specific `.env.*` loading, superuser auth, and token refresh
- Uniform response schema: success `code:10000`, error payloads still return HTTP 200 for compatibility

### Testing Strategy
- `npm test` runs `node --test`; current coverage focuses on route builder behavior/integration (`test/routeBuilder.test.js`)
- Tests use Hono's `app.fetch` for lightweight integration-style checks; no dedicated coverage tooling yet
- Add targeted tests alongside new utilities/routes when behavior is non-trivial or compatibility-sensitive

### Git Workflow
- No formal workflow documented; default to feature branches merged via PR into `main`
- Conventional commits not enforced; align commit summaries with the change proposal for traceability

## Domain Context
- 看粤语教学平台 backend with student/teacher/admin roles; needs parity with the legacy Sails.js API
- Modules include users, students, teachers, activities, lesson records, attendance, and audio/video materials
- Uses PocketBase collections for persistence and JWTs for session continuity; WeChat mini-program login/phone decrypt supported

## Important Constraints
- Maintain legacy response contract (HTTP 200 on errors, `code/message/data` shape, success code `10000`)
- Preserve existing routes/paths and semantics when extending (mobile/web clients depend on compatibility)
- Server must run under both Node.js and Bun; avoid Node-only APIs unless guarded
- Env loading uses `.env.<env>` (fallback `.env`); PB credentials required for online features
- Swagger JSON served via separate dev helper; `/swagger` returns 404 in production

## External Dependencies
- PocketBase service (docker-compose provided) authenticated via `_superusers`
- S3-compatible storage for media (`S3_URL`, `S3_BUCKET`)
- WeChat mini-program API (`jscode2session`) for auth/phone decrypt
- JWT secret/expiry configured in env; relies on `jsonwebtoken`
