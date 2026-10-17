## 1. Hono Signup and Ops APIs

- [x] 1.1 Add/verify activity signup route coverage for create, list, detail, duplicate, full, ended, cross-user, and missing-collection cases.
- [x] 1.2 Expose activity signup records as an `/ops/activitySignups` management resource with authorized list/detail/update behavior and audit logging.
- [x] 1.3 Add ops report detail support using the privacy-safe report projection used by share and student-owned report views.
- [x] 1.4 Update Swagger/schema checks for activity signup, ops signup review, and report detail APIs.

## 2. Mini Program Signup and Personal Content

- [x] 2.1 Add miniapp API client methods for activity signup create/list/detail and keep report APIs intact.
- [x] 2.2 Implement activity detail signup form, login gating, validation, idempotent already-registered state, and full/ended/unavailable error states.
- [x] 2.3 Add a registered "my signups" page reachable from profile, with empty, anonymous, loading, error, and activity navigation states.
- [x] 2.4 Add profile personal-content entries for reports, signups, audio favorites, and video favorites.
- [x] 2.5 Extend miniapp runtime verification to cover signup and personal-content links.

## 3. Admin Content Publishing

- [x] 3.1 Add resource form state/helpers for activities, audio materials, video materials, operation slots, and activity signups.
- [x] 3.2 Replace placeholder-only creation with create/edit/publish flows that call `/ops/*` APIs and refresh resource lists.
- [x] 3.3 Add signup review UI with status update actions and role-safe states.
- [x] 3.4 Add admin report detail UI and share-link creation/revocation flow from reports.

## 4. Tests and Coverage

- [x] 4.1 Add Taro unit tests for signup form logic, signup history mapping, profile personal-content links, API client calls, and runtime verifier expectations.
- [x] 4.2 Add Hono unit tests for signup APIs, ops signup review, report detail authorization, Swagger inclusion, and audit behavior.
- [x] 4.3 Add admin unit tests for resource forms, signup review, report detail/share actions, and app flow state.
- [x] 4.4 Add or update admin E2E coverage for login, content edit/publish, signup review, report detail/share, and role gating.

## 5. Verification

- [x] 5.1 Run `openspec validate complete-lightweight-edu-loop --strict --no-interactive`.
- [x] 5.2 Run `pnpm run test:coverage`, `pnpm run build:weapp`, and miniapp runtime verification in `ikanyue.taro3`.
- [x] 5.3 Run `npm run test:coverage`, `npm run lint`, `npm run ops:schema:check`, and `npm run swagger:build` in `ikanyue.mapi.hono`.
- [x] 5.4 Run `npm run test:coverage`, `npm run lint`, `npm run build`, and `npm run test:e2e` in `ikanyue.admin`.
- [x] 5.5 Confirm parent repository dependency neutrality and no Flutter changes.
