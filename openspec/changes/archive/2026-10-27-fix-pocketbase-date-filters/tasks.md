## 1. Single helper

- [x] 1.1 Move `filterTime` from `booking/time.js` to `repositories/operationRepository.js`, next to `escapeFilter`, and accept `Date`, epoch and ISO input.
- [x] 1.2 Point the existing callers at the new location:
  - `booking/{queryService,opsQueryService,backfillService}`
  - `schedule/{queryService,availabilityWindows}`
  - `commerce/operations`

## 2. Remaining filters

- [x] 2.1 Lot selection: `batchRepository.buildFefoFilter`.
- [x] 2.2 Booking:
  - `booking/workerService.expirePending`
  - `booking/decisionService` (teacher rule and pending overlap)
- [x] 2.3 Outbox and expiry:
  - `outboxService.dueFilter`
  - `expiryService.dueBatchFilter`
- [x] 2.4 Incremental reconciliation: `reconciliationService`.
- [x] 2.5 Validity windows: `sessionPublicationService.activeAtFilter`.
- [x] 2.6 Upcoming lessons:
  - `studentLearningService`
  - `opsQueryService`
  - `schedule/queryService` roster
  - `enrollmentService`
  - `enrollmentRosterSyncService`

## 3. Tests

- [x] 3.1 Regression assertions in the stored format:
  - FEFO filter
  - pending expiry
  - outbox `dueFilter` and stale claim
  - ops student overview
- [x] 3.2 Guard test `test/pocketbaseTimeFilterGuard.test.js`. It fails on any interpolated time comparison in `src` that does not go through `filterTime`.
- [x] 3.3 Run `pnpm lint`, `TZ=Asia/Shanghai pnpm test`, `pnpm check-docs`, and `openspec validate fix-pocketbase-date-filters --strict`.
