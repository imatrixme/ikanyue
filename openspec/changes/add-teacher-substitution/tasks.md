## 1. Tests first

- [ ] 1.1 `substituteTeacher` cases: before and after start, the original row becomes cancelled and a substitute lead is planned; the substitute confirms and the earning goes to them; busy substitute (`SUBSTITUTE_TEACHER_BUSY`); same teacher; settled lesson (`SESSION_ALREADY_SETTLED`) then undo, substitute, confirm; switching back reuses the old row; replay with the same key; hired teacher gets 403.
- [ ] 1.2 `handoverTeacher` cases: preview counts (lessons, conflicts, assistant roles, pending requests, offerings without the receiver, students); handover substitutes lessons, cancels other roles, declines pending requests with the reason, deactivates offerings and availability, blocks the account, leaves credit batches unchanged; conflicts refuse as a whole; administrator, self and missing reason are refused; replay.
- [ ] 1.3 View cases: student lesson and appointment views name the current lead and hide cancelled teachers; the replaced teacher cannot reschedule or cancel (`APPOINTMENT_TEACHER_FORBIDDEN`), an administrator can.

## 2. Server (`kanyue.server`)

- [ ] 2.1 `substituteTeacher` in `coursecredit` per design §1 (status rules, single lead, active target, overlap check, reuse of an existing row, audit, outbox, `prepareTeaching` idempotency).
- [ ] 2.2 `handoverPreview` and `handoverTeacher` per design §3, in one transaction with sub-keys, 500-lesson limit.
- [ ] 2.3 Views: filter cancelled teacher rows in student lesson contexts; appointment projections name the current lead when a lesson exists; teacher reschedule and cancel check the current lead.
- [ ] 2.4 Workbench routes in design §5 behind `managing(administrator)`; teacher list and teacher lessons queries.
- [ ] 2.5 Contract tests for the new routes; `gofmt`, `go vet`, `go test` per the root `AGENTS.md`.

## 3. Gateway

- [ ] 3.1 Add the routes to `kanyue.gateway/internal/exposure/mapi.json` (default policy set); `node --test scripts/gateway-exposure.test.mjs` stays green.

## 4. Mini program (`ikanyue.mini`)

- [ ] 4.1 `services/apis.js` calls for teachers, teacher lessons, substitute, handover preview and handover.
- [ ] 4.2 Workbench teachers section only for administrators with more than one teacher; substitute action on waiting lessons in the same case.
- [ ] 4.3 Pages: teachers list, teacher detail (unsettled lessons with substitute, handover); substitute popup (other teacher preselected when there are two, busy message); handover preview, reason and confirmation, conflicts block submission.
- [ ] 4.4 Unit tests for section visibility, preview mapping and error messages; `pnpm lint`, `TZ=Asia/Shanghai pnpm test`.
- [ ] 4.5 `test:live`: the owner substitutes a started lesson and the substitute confirms it; the owner hands a teacher over and the student keeps their lessons (local data only, the handed-over account is re-enabled afterwards).

## 5. Verification

- [ ] 5.1 WeChat DevTools walk-through as the owner with two teachers (substitute, handover preview) and as a solo owner (no entry), with screenshots.
- [ ] 5.2 `openspec validate add-teacher-substitution --strict`.
