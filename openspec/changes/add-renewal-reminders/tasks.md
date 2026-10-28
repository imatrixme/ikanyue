## 0. Decisions

- [ ] 0.1 Confirm the thresholds, cooldown, scan time, WeChat subscribe message, and teacher visibility listed in `proposal.md`.

## 1. API (`kanyue.server`)

- [ ] 1.1 Add the `renewal_reminders` collection as a Go migration (student, course, trigger, reason, channel, status, operator, round key).
- [ ] 1.2 Add a reminder service with a pure eligibility function reusing the student learning course summaries in `internal/coursecredit`; Go tests run with `TZ=Asia/Shanghai`.
- [ ] 1.3 Add the daily scan as an in-process cron job with an idempotent round key.
- [ ] 1.4 Add ops endpoints: list renewal candidates, send manual reminders (single/batch, daily limit).
- [ ] 1.5 Add a student endpoint for unread 教务提醒 and mark-read.
- [ ] 1.6 Optional: WeChat subscribe message adapter behind config; record `skipped` when unconfigured.

## 2. Admin (`ikanyue.admin`)

- [ ] 2.1 Add a "待续费" list with reason, remaining lessons, expiry, and last reminder.
- [ ] 2.2 Add single and batch "发送续费提醒" actions with readable results.

## 3. Mini program (`ikanyue.taro3`)

- [ ] 3.1 Show the 教务提醒 on the home page linking to the course package page.
- [ ] 3.2 Optional: subscribe permission button after booking or renewal.

## 4. Verification

- [ ] 4.1 Run checks for each touched subproject per the root `AGENTS.md` table.
- [ ] 4.2 Run `openspec validate add-renewal-reminders --strict`.
