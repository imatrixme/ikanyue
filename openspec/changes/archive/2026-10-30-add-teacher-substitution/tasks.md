## 1. Tests first

- [x] 1.1 `substituteTeacher` cases: before and after start, the original row becomes cancelled and a substitute lead is planned; the substitute confirms and the earning goes to them; busy substitute (`SUBSTITUTE_TEACHER_BUSY`); same teacher; settled lesson (`SESSION_ALREADY_SETTLED`) then undo, substitute, confirm; switching back reuses the old row; replay with the same key; hired teacher gets 403.
- [x] 1.2 `handoverTeacher` cases: preview counts (lessons, conflicts, assistant roles, pending requests, offerings without the receiver, students); handover substitutes lessons, cancels other roles, declines pending requests with the reason, deactivates offerings and availability, blocks the account, leaves credit batches unchanged; conflicts refuse as a whole; administrator, self and missing reason are refused; replay.
- [x] 1.3 View cases: student lesson and appointment views name the current lead and hide cancelled teachers; the appointment moves to the substitute (who can view, cancel, and reschedule once they offer the course, else `APPOINTMENT_OFFERING_UNAVAILABLE`); the replaced teacher cannot view or change it (`APPOINTMENT_TEACHER_FORBIDDEN`); a blocked teacher's session is rejected at once.

## 2. Server (`kanyue.server`)

- [x] 2.1 `substituteTeacher` in `coursecredit` per design §1 (status rules, planned/confirmed leads replaced and absent leads kept, active target, calendar cells moved, overlap check, reuse of an existing row, audit, outbox, `prepareTeaching` idempotency).
- [x] 2.2 `handoverPreview` and `handoverTeacher` per design §3, in one transaction with sub-keys, 500-lesson limit.
- [x] 2.3 Views: filter cancelled teacher rows in student lesson contexts; appointment projections name the current lead when a lesson exists; teacher reschedule and cancel check the current lead.
- [x] 2.4 Workbench routes in design §5 behind `managing(administrator)`; teacher list and teacher lessons queries.
- [x] 2.5 Contract tests for the new routes; `gofmt`, `go vet`, `go test` per the root `AGENTS.md`.

## 3. Gateway

- [x] 3.1 Add the routes to `kanyue.gateway/internal/exposure/mapi.json` (default policy set); `node --test scripts/gateway-exposure.test.mjs` stays green.

## 4. Mini program (`ikanyue.mini`)

- [x] 4.1 `services/apis.js` calls for teachers, teacher lessons, substitute, handover preview and handover.
- [x] 4.2 Workbench teachers section only for administrators with more than one teacher; substitute action on waiting lessons in the same case.
- [x] 4.3 Pages: teachers list, teacher detail (unsettled lessons with substitute, handover); substitute popup (other teacher preselected when there are two, busy message); handover preview, reason and confirmation, conflicts block submission.
- [x] 4.4 Unit tests for section visibility, preview mapping and error messages; `pnpm lint`, `TZ=Asia/Shanghai pnpm test`.
- [x] 4.5 `test:live`: the owner substitutes a started lesson and confirms it as the substitute, and previews handing the hired teacher over (execution is covered by `TestHandoverLeavingTeacher` so local accounts stay usable).

## 5. Verification

- [x] 5.1 WeChat DevTools walk-through as the owner with two teachers (substitute, handover preview) and as a solo owner (no entry), with screenshots.
- [x] 5.2 `openspec validate add-teacher-substitution --strict`.
