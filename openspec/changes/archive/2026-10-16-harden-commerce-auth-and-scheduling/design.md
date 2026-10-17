## Context

Review findings were re-verified before this change. Three original findings were false positives and are not addressed: the miniapp course shop has an entry (`pages/courses` → 选课与订单), teacher tab labels are already switched by `RoleManager.applyTabBar`, and Admin navigation is already capability-filtered. The mock-refund button already resolves the business refund id through `financeView`.

## Decisions

### Tokens
- One helper, `jwtAuth.sign(..., claims, { expiresIn })`, uses `jsonwebtoken`'s standard `exp`. The broken `expiredAt` claim (read from a non-existent `req.headers`, computed from `dayjs().second()`) is removed together with its middleware checks.
- `JWT_SECRET` must be ≥32 characters. Production refuses to sign or verify without it; development/test fall back to a per-process random secret with a warning so tests and ad-hoc runs keep working. The native stack persists a generated secret.
- TTLs: app 30d (the miniapp calls `/v1/user/refresh` on launch, giving a sliding session and logging out on 403), Admin 12h, role challenge 10m. Capability claims therefore go stale for at most 12h in Admin, which is accepted instead of per-request capability lookups.
- Admin keeps `localStorage` but decodes `exp`; expired sessions are dropped on load and a timer signs out at expiry. httpOnly cookies were rejected as disproportionate (CSRF handling, SSR, proxy changes).

### Payment expiry and scanning
- `PAYMENT_TTL_MS = 30min`. WeChat prepay sends `time_expire` (+08:00); because a prepay id outlives the TTL, prepay renewal is removed. Recovery closes expired pending payments through the existing close path, which emits `payment.closed`; the business order becomes `failed` via existing sync. Late successes remain handled by the existing late-payment path.
- `Store.list(kind, owner, where?)` gains simple equality/inequality filters on `data.*`. Provider observations get `applied: true` in the same commit that applies them and are reset on every status change, so polling reads only un-applied terminal observations. No new collections or indexes.

### Batch capacity
- A PocketBase migration sets batch `maxRequests` to at least 1000; startup requires ≥500; `send()` rejects plans over 500 with a business message. This keeps one-transaction semantics without chunking (chunking would break atomicity).

### Scheduler
- Sessions have no teacher/class fields until publication, so a scheduler "draft" cannot retain the selection. The scheduler only publishes; if publish fails the just-created draft is cancelled. Multi-week publishing stays sequential and reports exactly which dates were created — a server batch endpoint was rejected as over-design for ≤8 lessons.
- Lesson code: `SCH-<local time>-<teacher suffix>-<random>` avoids cross-teacher and post-cancellation collisions.

### Admin payments IA
- Tabs: 订单管理 / 待处理 / 课程商品 / 账单对账. Payment and refund lists duplicate the order dialog (which already lists refunds); the dev-only mock-refund action moves into that dialog. Current gateway findings already appear under 待处理. The course-credit 异常中心 is a different domain (ledger/settlement) and stays separate; the tab is labelled 待处理 inside 收款与退款 to avoid ambiguity.

## Risks

- All users re-login once after deploy (new secret). Acceptable and announced in tasks.
- JSON-path filters rely on PocketBase ≥0.22 filter support; the pinned 0.32.0 supports them and the PB integration test covers it.
