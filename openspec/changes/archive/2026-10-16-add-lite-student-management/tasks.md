## 1. Wide Layout Guard

- [x] 1.1 Constrain shared Admin inputs and selects to their responsive grid tracks.
- [x] 1.2 Add automated wide-viewport overlap checks for points and reward filter controls.

## 2. Admin Student API

- [x] 2.1 Add normalized student-management input and output contracts to the Admin client.
- [x] 2.2 Add an Admin-only `StudentAdminService` with list, create, edit, password reset, and enabled-status behavior.
- [x] 2.3 Register `GET /ops/students`, `POST /ops/students`, and `POST /ops/students/:id` handlers.
- [x] 2.4 Exclude blocked learners from points-operation rows while retaining them in student management.
- [x] 2.5 Add Hono service and route tests for validation, authorization, duplicate cellphone, password preservation, and status changes.

## 3. Student Management Interface

- [x] 3.1 Add a `students` Admin view and navigation item without exposing broader academic features.
- [x] 3.2 Add a desktop student table and mobile student cards with identity, cellphone, status, last-login, and edit actions.
- [x] 3.3 Add keyword, status, sorting, reset, pagination, loading, true-empty, filtered-empty, and retry controls.
- [x] 3.4 Add one create/edit student dialog with required-field validation, optional password reset, and unsaved-change protection.
- [x] 3.5 Refresh student-management and points projections after successful identity or status mutations.

## 4. Verification

- [x] 4.1 Add Admin unit coverage for student list states, filters, create/edit failures, status changes, and dialog lifecycle.
- [x] 4.2 Add desktop/mobile mock Playwright coverage for student management and wide-layout alignment.
- [x] 4.3 Extend local smoke and live Playwright coverage through real Hono and PocketBase student create/edit/disable flows.
- [x] 4.4 Run Admin coverage, lint, build, mock E2E, Hono focused tests, local smoke, and strict OpenSpec validation without Docker.
- [x] 4.5 Visually inspect wide filters, desktop student table, mobile cards, and mobile full-screen student editor with no horizontal overflow.
