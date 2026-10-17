## Why

A cross-project review of the points-lite, course-credit/booking and payment-gateway branches found that money and scheduling flows sit on an authentication layer with a source-committed signing key and tokens that never expire, plus several verified operational defects (abandoned payments polled forever, unbounded batch plans, colliding lesson codes, scheduler drafts that silently drop data). Real charging must not be enabled on top of these.

## What Changes

- **BREAKING (sessions)**: JWTs are signed with `JWT_SECRET` from the environment (required in production) and carry a real `exp`: 30 days for app tokens (refreshed on launch), 12 hours for Admin tokens, 5 minutes for WeChat role challenges. Admin endpoints accept only tokens carrying `scope: ops`, so 30-day miniapp teacher tokens can no longer open Admin. All existing tokens are invalidated once.
- Admin login escapes its account filter and drops the plaintext-password fallback; Admin discards expired cached sessions and signs out when the token expires.
- Gateway closes unpaid payments after 30 minutes (WeChat `time_expire` plus active close) and only scans open payments, open refunds, un-applied provider results and unacknowledged events.
- Business event recovery acknowledges events that reference no commerce record, so they cannot block the 100-event window.
- Business PocketBase batch capacity is raised by a versioned migration and verified at startup; oversize plans fail with a readable message. Commerce collections gain a versioned production migration.
- Visual scheduler: publish-only (drafts stay in 课堂管理), per-teacher unique lesson codes, compensating cancellation when publish fails, drag selection that cannot cross occupied slots, 08:00–22:00 day. Lesson rule snapshots default on the server.
- Admin 收款与退款: seven tabs reduced to four, one "同步并核对" action, finance moved to its own navigation group.
- Miniapp order page: status-appropriate actions, re-purchase for unfinished orders, short checkout confirmation; profile removes decorative noise; unpublished legacy course-credit pages are deleted.
- Gateway client tolerates non-JSON error bodies. Root README/.gitmodules branch drift is fixed.

## Non-goals

- Replacing MD5 storage of legacy miniapp passwords (needs a data migration; tracked as residual risk).
- Moving Admin tokens to httpOnly cookies (short expiry is the proportionate mitigation for this deployment).
- Server-side atomic multi-week scheduling, student occupancy in the scheduler, splitting the miniapp into subpackages, or removing `virtual-pet` from branch history (requires an explicit git decision).

## Impact

- `ikanyue.mapi.hono`: `utils/jwtAuth.js`, auth middleware, ops auth service, WeChat role challenge, commerce recovery/gateway client, batch repository/startup, lesson resource defaults, migrations generator and new migrations, env example.
- `kanyue.pay`: store filtering, polling, payment expiry, prepay `time_expire`.
- `ikanyue.admin`: session expiry, payments workspace, navigation, visual scheduler.
- `ikanyue.taro3`: order/shop pages, profile, legacy page removal.
- Root: `scripts/native-stack.mjs` (local `JWT_SECRET`), `compose.yaml`, README, `.gitmodules`.
