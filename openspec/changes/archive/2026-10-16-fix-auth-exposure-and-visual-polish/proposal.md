## Why

The aesthetic review (2026-09-24, evidence in `.local/aesthetic-review-2026-09-24/`) and the local rehearsal it required surfaced defects outside pure visuals: password login returned the stored MD5 hash and `tokenKey`, silently created accounts for unknown numbers, interpolated the cellphone into a storage filter and had no attempt limit; the website course detail route never rendered and exposed raw enum codes; the two local PocketBase instances shared one migrations directory. The miniapp and website also carried repeated titles, English eyebrows, decorative seals, off-palette icons, stock illustrations and CJK headings broken mid-word.

## What Changes

- **BREAKING (login)**: password login no longer auto-registers unknown numbers (401 instead); new users join through WeChat login. Repeated failures per account are limited to 5 per 15 minutes (429).
- User payloads from login, refresh, profile update, student/teacher create/update and WeChat identity pass through one `publicUser()` redaction (password, hash, tokenKey, WeChat ids, last login IP). Cellphone filters are escaped.
- Website: course index moved to `courses/index.vue` so `/courses/:code` renders; delivery, unit and activation enums shown as Chinese labels, codes hidden; activity times formatted in `Asia/Shanghai`; English eyebrows removed; headings measured in `em` with balanced wrapping; 16px mobile gutter; horizontally scrolling course cards on mobile home; header consult CTA is a button; faculty specialties are chips; activity excerpts clamp to 2 lines; hero crops keep faces; footer states images are illustrative.
- Miniapp: one title per page (native nav title only), canvas background everywhere except profile; profile reduced to identity card + 学习 / 账号 groups; courses page gets a slim summary and a 预约与购买 group; points/reward wording unified to 可领取 / 未解锁; seals removed; reward thumbnails fall back to the gift icon; shop cards collapse refund rules into a link and show them in the purchase confirmation; teacher tab icons redrawn as outline icons; off-palette icons recoloured; empty states use brand object art instead of stock people; teacher date strip uses the same circle selection as activities.
- Local stack: each PocketBase gets its own `--migrationsDir` with `--automigrate=false`.

## Non-goals

- Replacing MD5 password storage or moving throttling to a shared store (single-process API; tracked as residual risk).
- Replacing generated teaching photos with real faculty photography (needs owner-supplied assets).

## Impact

- `ikanyue.mapi.hono`: `src/utils/publicUser.js`, user/student/teacher routes, WeChat identity service, login docs and tests.
- `ikanyue.website`: pages, `utils/course-catalog.ts`, `utils/academy-time.ts`, CSS, footer.
- `ikanyue.taro3`: page chrome/header, profile, courses, points, shop, booking pages, icons and empty-state art.
- Root: `scripts/native-stack.mjs`.
