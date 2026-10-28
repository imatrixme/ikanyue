## 0. Decisions

- [x] 0.1 Confirm the thresholds, cooldown, scan time, WeChat subscribe message, and teacher visibility listed in `proposal.md` (2026-10-28: proposal defaults; WeChat one-time subscribe integrated behind config; teachers see a read-only list).

## 1. API (`kanyue.server`)

- [x] 1.1 Add the `renewal_reminders` collection as a Go migration (student, course, trigger, reason, WeChat status, operator, round key, unique dedupe key), plus `renewal_subscriptions` for one-time subscribe grants.
- [x] 1.2 Add a reminder service with a pure eligibility function reusing the student learning course summaries in `internal/coursecredit`; Go tests run with `TZ=Asia/Shanghai`.
- [x] 1.3 Add the daily scan as an in-process cron job (`0 2 * * *` UTC = 10:00 Asia/Shanghai) with an idempotent round key.
- [x] 1.4 Add ops endpoints: list renewal candidates, send manual reminders (single/batch, daily limit).
- [x] 1.5 Add student endpoints for unread 教务提醒, mark-read and subscribe grants; add the teachers' read-only list.
- [x] 1.6 WeChat subscribe message adapter behind config; record `skipped` when unconfigured or without a grant.

## 2. Admin (`ikanyue.admin`)

- [x] 2.1 Add a "待续费" list with reason, remaining lessons, expiry, and last reminder.
- [x] 2.2 Add single and batch "发送续费提醒" actions with readable results.

## 3. Mini program (`ikanyue.taro3`)

- [x] 3.1 Show the 教务提醒 on the home page linking to the course package page.
- [x] 3.2 Subscribe permission entry on the home lesson card when a template is configured.
- [x] 3.3 Show teachers a read-only "待续费学员" list on the workbench.

## 4. Verification

- [x] 4.1 Run checks for each touched subproject per the root `AGENTS.md` table.
- [x] 4.2 Run `openspec validate add-renewal-reminders --strict`.
- [ ] 4.3 Pick the subscribe template in the mini program console, set `WECHAT_RENEWAL_TEMPLATE_*`, and check one real reminder on a device.
