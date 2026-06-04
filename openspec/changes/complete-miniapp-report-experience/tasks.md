## 1. Hono Student Report APIs

- [x] 1.1 Add student-authenticated `/v1/student/reports` list/detail routes that derive the student id from auth context.
- [x] 1.2 Add report projection helpers that return the same privacy-safe report payload for share-token and student-owned report reads.
- [x] 1.3 Add Hono route/service tests for own-report list, own-report detail, anonymous rejection, cross-student rejection, and private-field exclusion.

## 2. Mini Program Report Discovery

- [x] 2.1 Add a registered report-history page in `ikanyue.taro3` and a profile entry that prompts anonymous users to log in.
- [x] 2.2 Add API client methods for authenticated report list/detail and keep share-token viewing as a separate public method.
- [x] 2.3 Implement report-history loading, empty state, newest-first display, and navigation into report detail.

## 3. Rich Report Rendering

- [x] 3.1 Expand report page logic to normalize shared-token and student-owned payloads into one view model with summary, sections, comments, recommendations, score, grade, and generated date.
- [x] 3.2 Update report page UI/styles to render the richer view model and privacy-safe unavailable states within mini program layout constraints.
- [x] 3.3 Add report page unit tests for full payloads, sparse payloads, invalid token state, private-field exclusion, and student-owned detail navigation.

## 4. Resilient Operation Slots

- [x] 4.1 Refactor activity home loading so operation slots, static navigation, and activity list state update independently.
- [x] 4.2 Add unsupported-target filtering and user-safe fallback behavior for incomplete operation-slot records.
- [x] 4.3 Add unit tests for activity failure with operation slots present, operation-slot failure with activities present, static navigation fallback, and all supported target URLs.

## 5. Runtime Verification

- [x] 5.1 Add a repeatable mini program runtime verification script or documented fixture checklist covering home operation slots, report history, shared-token opening, invalid-token handling, and student-owned report detail.
- [x] 5.2 Run Taro unit coverage and WeChat build from `ikanyue.taro3`.
- [x] 5.3 Run Hono tests, lint, coverage, and any affected schema/swagger checks from `ikanyue.mapi.hono`.
- [x] 5.4 Run `openspec validate complete-miniapp-report-experience --strict --no-interactive` and confirm parent repository dependency neutrality.
