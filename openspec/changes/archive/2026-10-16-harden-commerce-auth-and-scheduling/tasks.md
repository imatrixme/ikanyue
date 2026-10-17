## 1. Authentication (ikanyue.mapi.hono, ikanyue.admin, root)

- [x] 1.1 `jwtAuth`: env secret (production-required, dev random fallback), standard `exp` via `expiresIn`, remove `expiredAt` logic and middleware checks.
- [x] 1.2 TTLs: Admin 12h, app 30d, WeChat role challenge 5m; Admin tokens carry `scope: ops`, challenge tokens rejected as sessions.
- [x] 1.3 Admin login: escape account filter, remove plaintext password equality.
- [x] 1.4 Admin: drop expired cached session; sign out at `exp`.
- [x] 1.5 `JWT_SECRET` in env example, compose and native stack config.

## 2. Payment gateway (kanyue.pay)

- [x] 2.1 `Store.list` data filters (PocketBase + memory).
- [x] 2.2 Mark provider results `applied`; poll only open work; events list filtered to unacknowledged.
- [x] 2.3 30-minute payment window: WeChat `time_expire`, close expired pending payments, drop prepay renewal.

## 3. Business commerce and storage (ikanyue.mapi.hono)

- [x] 3.1 Recovery acknowledges orphan events.
- [x] 3.2 Gateway client tolerates non-JSON error responses.
- [x] 3.3 Batch capacity migration, startup check, `send()` plan limit; commerce ensure script no longer lowers capacity.
- [x] 3.4 Generated commerce migration.
- [x] 3.5 Lesson resource server defaults.

## 4. Admin (ikanyue.admin)

- [x] 4.1 Scheduler: publish-only, compensation, unique codes, occupancy-aware selection, 22:00 day end.
- [x] 4.2 收款与退款: four tabs, merged sync action, mock refund inside order dialog, finance navigation group.

## 5. Miniapp (ikanyue.taro3)

- [x] 5.1 Order page action states and re-purchase; short checkout confirmation; tidy shop template.
- [x] 5.2 Profile: group rename and removal of decorative noise.
- [x] 5.3 Delete unpublished legacy course-credit pages and their components.

## 6. Docs and verification

- [x] 6.1 README/.gitmodules branch drift; kanyue.pay README payment window and scanning.
- [x] 6.2 Run tests for all four projects (TZ=Asia/Shanghai), Admin/miniapp builds, `openspec validate`.
- [x] 6.3 Deploy note: new `JWT_SECRET` signs everyone out once; apply migrations before start.
