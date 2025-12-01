## 1. Specification
- [ ] 1.1 Map required progress metrics to PocketBase data (lesson records, attendance, hours fields, date filters)
- [ ] 1.2 Define request/response contracts for `/v1/report/student-progress` and `/v1/report/student-progress/export` (auth + pagination)

## 2. Implementation
- [ ] 2.1 Implement aggregation helper/service for progress metrics with date range support and role-aware filters
- [ ] 2.2 Add report routes using the route builder with `auth`, `teacher`, `admin` guards as appropriate
- [ ] 2.3 Implement CSV export leveraging `fileUrl`/S3 config; ensure errors surface via unified response middleware

## 3. Testing
- [ ] 3.1 Add `node --test` coverage for aggregation logic (happy path, missing data, PocketBase errors)
- [ ] 3.2 Add Hono route integration tests for auth + payload shape (summary + export trigger)
