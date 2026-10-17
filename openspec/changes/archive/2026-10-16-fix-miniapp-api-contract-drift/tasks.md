## 1. Public activity feed (ikanyue.mapi.hono)

- [x] 1.1 `activity/find.js`: active-only list and id lookup, `filterLiteral()` for every value, validated time bounds, sort whitelist; docs updated.
- [x] 1.2 Escape filter values in unmounted legacy routes.
- [x] 1.3 Tests for status override, operator injection, invalid time, non-active id and sort whitelist.

## 2. Session and logging

- [x] 2.1 Auth middleware returns `errorCode: AUTH_SESSION_INVALID`; test.
- [x] 2.2 Miniapp request wrapper clears the session on that code; test.
- [x] 2.3 Remove response/user/token logging from miniapp utils and pages.

## 3. Academy clock (ikanyue.taro3)

- [x] 3.1 `utils/academyTime.js` with tests under a non-Shanghai timezone.
- [x] 3.2 Booking, course, points, activity and teacher pages use it.

## 4. Booking command keys

- [x] 4.1 `utils/commandKeys.js` persists keys per user and draft; settle on server answer.
- [x] 4.2 Student request, withdraw/cancel, teacher decisions, reschedule and availability use it.

## 5. Commerce duplicate

- [x] 5.1 Remove `/v1/student/commerce/appointments/:id/cancellation-preview` and `Commerce.cancellationPreview`.

## 6. Verification

- [x] 6.1 Hono lint, tests, check-docs, swagger rebuild; miniapp lint, tests (Asia/Shanghai, `test:tz`, UTC), weapp build and e2e (now also guards runtime logging); `openspec validate --strict`.
