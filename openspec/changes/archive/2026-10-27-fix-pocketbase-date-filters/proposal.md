## Why

`harden-booking-validation-and-shanghai-time` found that PocketBase stores `date` and `autodate` values as `YYYY-MM-DD HH:MM:SS.sssZ` text and compares filter literals as text. An ISO `...T...Z` literal therefore sorts after every stored value on the same UTC day. That change fixed booking, schedule and the finance order list.

The remaining course-credit filters still build ISO literals, and each one behaves wrongly on the boundary day:

- **Lot selection** (`batchRepository.buildFefoFilter`). This filter is used by reservation, booking confirmation and slot eligibility.
  - `effectiveExpiresAt>` and `activationDeadline>` exclude a batch that expires later on the same UTC day as the lesson, which gives a false "课时不足".
  - `validFrom<=` includes a batch that only becomes valid later that day.
- **Pending appointment expiry** (`booking/workerService.expirePending`). This worker has no in-memory re-check, so `responseDeadline<=` expires pending requests whose deadline is still hours away on the same UTC day.
- **Outbox scheduling** (`outboxService`).
  - `nextAttemptAt<=` retries before the backoff ends.
  - `processingStartedAt<=` treats an event that is still processing as stale and claims it again.
- **Teacher rules, class membership and session publication** (`decisionService.findTeacherRule`, `sessionPublicationService.activeAtFilter`). Validity windows that start or end on the lesson's UTC day are judged wrong.
- **Upcoming lessons** (`studentLearningService`, `opsQueryService`, `schedule/queryService`, `enrollmentService`, `enrollmentRosterSyncService`).
  - `startAt>=now` and `endAt>now` drop lessons later on the current UTC day.
  - For example, a student enrolled at 09:00 Shanghai time is not added to a lesson at 15:00 the same day.
- **Incremental reconciliation** (`reconciliationService`). `updated>=` and `created>=` skip rows changed later on the `since` day.
- **Credit expiry** (`expiryService`). Its candidate query over-fetches, but every batch is re-checked in memory, so nothing expires early.

## What Changes

- Move `filterTime` from `booking/time.js` to `repositories/operationRepository.js`, next to `escapeFilter`, as the single helper for time values in PocketBase filters. Update the existing callers.
- Use `filterTime` in every remaining course-credit time filter:
  - `batchRepository`
  - `booking/workerService`, `booking/decisionService`
  - `outboxService`, `expiryService`, `reconciliationService`
  - `sessionPublicationService`, `studentLearningService`, `opsQueryService`
  - `schedule/queryService` (the upcoming-roster query)
  - `enrollmentService`, `enrollmentRosterSyncService`
- Add regression tests that assert the stored format for lot selection, appointment expiry and outbox scheduling.
- Add a guard test that scans `src` and fails when a time comparison in a filter is built without `filterTime`, so new code cannot reintroduce the bug.

## Impact

- Affected specs: `course-credit-ledger` gains one requirement covering how time filters compare instants.
- Affected code: `ikanyue.mapi.hono/src/services/courseCredits/**`, `src/services/commerce/operations.js` (import path only), plus tests.
- Every changed field was checked against the local PocketBase schema and is of type `date` or `autodate`, so the stored format is right for all of them.
- No schema change, data migration or public API change. Query results change only on the boundary day, and they change to the correct answer.
