## Why

The current project can display activities, materials, and assessment reports, but several user-facing loops stop before completion: mini program users cannot actually sign up for activities, view their signup history, or get a coherent "my content" area, while the admin UI can only create default resource records rather than complete publishable content. This change closes the lightweight education-management loop without expanding into the paused Flutter app or a root JavaScript workspace.

## What Changes

- Add mini program activity signup submission, signup-state feedback, duplicate/full/ended handling, and a "my signups" page.
- Add mini program personal-content aggregation for reports, signups, and local material favorites from the profile surface.
- Expand admin content management from list/default-create screens to practical create/edit/publish flows for activities, audio materials, video materials, operation slots, and signup review.
- Add admin report detail/share actions so generated assessment reports are inspectable and shareable from the operations UI.
- Extend Hono `/ops/*` and miniapp-facing APIs where needed for signup listing/review, resource detail/update, report detail, and consistent authorization.
- Add unit tests and workflow coverage so affected Taro, Hono, and admin projects keep 90%+ coverage.
- Do not implement or modify Flutter in this change.

## Capabilities

### New Capabilities
- `miniapp-activity-signups`: Student activity signup, signup history, and personal-content entry points in the mini program.
- `admin-content-publishing`: Admin-side create/edit/publish workflows for activities, materials, operation slots, and signup review.

### Modified Capabilities
- `ops-admin-system`: Add complete edit/detail/publish and signup-review requirements to the existing first-phase management modules.
- `assessment-reporting`: Add admin report detail/share usability requirements and preserve student-owned report access.
- `miniapp-page-api-unit-coverage`: Expand coverage scope to the new signup and personal-content page flows.
- `subproject-unit-test-coverage`: Require 90%+ coverage evidence across every affected subproject for this loop.

## Impact

- `ikanyue.taro3`: activity detail, API client, profile page, new signup/history/personal-content helpers and tests.
- `ikanyue.mapi.hono`: activity signup routes/services, `/ops/*` management resources, report detail/share handlers, Swagger/schema checks, Node tests.
- `ikanyue.admin`: resource forms, signup review, report detail/share UI, React unit tests and E2E coverage.
- `openspec`: new and delta specs plus task checklist.
- Parent repository remains dependency-neutral with no root `package.json`, lockfile, or shared workspace.
