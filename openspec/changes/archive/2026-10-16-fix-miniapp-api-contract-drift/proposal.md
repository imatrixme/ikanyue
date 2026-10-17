## Why

The 2026-10-16 contract audit (miniapp ↔ Hono API) found one exploitable hole and several front/back-end drifts:

- `GET /v1/activity/find` is public, runs on the PocketBase superuser client and interpolates `status`, `tags`, `type`, `location`, `start_time_*` and `sort` into the storage filter. `status=all` lists unpublished activities, `id` lookups ignore status, and PocketBase `@collection.*` filters turn it into a boolean oracle over any collection.
- The production miniapp bundle logs every API response, the cached user record and the token prefix.
- An expired or invalid token answers envelope `code: 403`, the same code as "forbidden", "blocked" and "under review". Only the profile page's refresh signs the user out; other tabs keep a dead token and a retry that can never succeed.
- The API books in Asia/Shanghai (fixed +08:00, `booking/time.js`) and returns that timezone, but most miniapp pages format and compose times in the device timezone.
- `GET /v1/student/commerce/appointments/:id/cancellation-preview` duplicates `/v1/student/appointments/:id/cancellation-preview`; only an unused client method calls it.
- Booking commands generate a fresh `Idempotency-Key` on every tap, so a retry after a lost response is a new command.
- Unmounted legacy routes interpolate filters the same way; remounting any of them would reopen the hole.

## What Changes

- **Security**: the public activity query always filters `status="active"` (list and single), escapes every value with `filterLiteral()`, validates time bounds and only accepts whitelisted sort fields. Legacy unmounted routes escape their filter values too.
- **BREAKING (public API)**: `/v1/activity/find` ignores the `status` query parameter and returns 404 for non-active ids.
- The auth middleware adds `errorCode: "AUTH_SESSION_INVALID"` to missing/invalid-token responses (code stays 403). The miniapp request wrapper clears the local session on that code; pages fall back to their signed-out state.
- The miniapp stops logging response bodies, user records and tokens.
- A shared `utils/academyTime.js` formats and composes miniapp times on the academy clock (+08:00, same as the API); booking, course, points and activity pages use it.
- Booking commands keep their idempotency key per user and draft until the server answers; retries reuse it. Course checkout and refund move to the same helper instead of their own storage keys.
- The duplicate commerce cancellation-preview route and `Commerce.cancellationPreview` are removed.

## Non-goals

- Per-institution timezones (the API itself is fixed to +08:00).
- Deleting legacy route modules (tests still exercise some of them).
- Moving the activity feed off the superuser client.

## Impact

- `ikanyue.mapi.hono`: `src/routes/activity/find.js`, `src/middleware/auth.js`, `src/routes/commerce/index.js`, legacy route filters, tests and docs.
- `ikanyue.taro3`: `utils/request.js`, `utils/usermanager.js`, `utils/apis.js`, `utils/commerce.js`, new `utils/academyTime.js` and `utils/commandKeys.js`, booking/course/points/activity/shop/order pages, `test:tz` script, e2e runtime-logging guard, tests.
