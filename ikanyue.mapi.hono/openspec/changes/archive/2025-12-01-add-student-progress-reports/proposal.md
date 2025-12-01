# Change: Add student progress reporting API

## Why
Current clients can only fetch raw lesson/attendance records. Admins and teachers need aggregated progress insights (hours learned, attendance rates, latest activity) and exports to manage student outcomes without manual spreadsheet work.

## What Changes
- Add reporting endpoints under `/v1/report` to return per-student progress summaries with optional date filters
- Provide CSV export flow that streams progress data to S3 and returns a download URL
- Enforce teacher/admin permissions and keep responses compatible with existing contract
- Add tests for aggregation logic and route behavior

## Impact
- Affected specs: student-progress
- Affected code: new `src/routes/report/*`, `src/utils/recordMappers.js`, `src/utils/fileUrl.js` (for exports), PocketBase queries, Swagger docs/scripts
