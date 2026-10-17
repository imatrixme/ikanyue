## Context

The kanyue workspace is a parent repository with independent subprojects. The mini program (`ikanyue.taro3`) already displays activities, audio/video materials, profile data, and assessment reports. The Hono API (`ikanyue.mapi.hono`) already has miniapp-facing activity signup routes and `/ops/*` management APIs. The admin UI (`ikanyue.admin`) already has authenticated dashboards, resource list views, assessment templates, assessment submission, report listing, and share preview.

The missing loop is mostly integration and practical editing: the mini program does not call the signup API, the user has no signup history entry, the admin UI creates placeholder records instead of editing complete publishable content, and reports lack a useful admin detail path. Flutter remains paused.

## Goals / Non-Goals

**Goals:**
- Let logged-in mini program users sign up for eligible activities and see their signup history.
- Make profile-based personal content coherent by linking reports, signups, and local material favorites.
- Let admins create/edit/publish the minimum viable activity/material/operation-slot records needed by the mini program.
- Let ops users review activity signups and inspect/share report details from admin.
- Keep server-side role and ownership checks authoritative.
- Keep affected Taro, Hono, and admin projects at 90%+ coverage with repeatable commands.

**Non-Goals:**
- No Flutter work.
- No root JavaScript workspace, root package manifest, or shared lockfile.
- No payment, refunds, membership entitlement, course scheduling, leave/make-up-class, or full CRM workflows.
- No direct PocketBase browser access from `ikanyue.admin`.

## Decisions

### Reuse existing Hono routes before adding new services
The activity signup API already supports create/find/detail for authenticated students. The mini program should call these routes through `utils/apis.js` rather than introducing a second signup endpoint.

Alternative considered: build signup through `/ops/*`. Rejected because signups are student-facing actions, while `/ops/*` is teacher/admin-only.

### Add admin signup review through the ops resource model
Activity signup review should be exposed as an ops-managed resource (`activitySignups`) using the existing management-service pattern, with admin/teacher read scoping and admin status updates. This keeps browser access under `/ops/*`.

Alternative considered: reuse `/v1/activity-signup/find` from admin. Rejected because it is scoped to the logged-in student and does not fit teacher/admin authorization.

### Keep miniapp personal content lightweight
Reports and signups are server-backed. Audio/video favorites remain local device favorites for this change, because they are already implemented that way and turning them into server-backed favorites would add account migration and conflict resolution.

Alternative considered: server-backed favorites. Deferred to a later capability.

### Make admin publishing form-driven, not schema-driven
The first implementation will add explicit forms for the managed resources that are part of the lightweight loop: activities, audio materials, video materials, operation slots, reports, and signups. This is more predictable than building a generic schema editor and allows focused tests.

Alternative considered: fully generic dynamic form renderer. Rejected for this change because the resource semantics are different enough that a generic editor would hide validation and status rules.

### Coverage is a release gate
Each affected project must provide a local command proving at least 90% lines, branches, functions, and statements where the project supports those thresholds. Existing coverage scripts should be reused rather than centralizing validation in the parent repo.

## Risks / Trade-offs

- Signup collection may be missing in a local PocketBase instance -> Hono already returns a clear configuration error; tests will cover this path.
- Miniapp signup depends on cached profile data quality -> the signup form will prefill from local user info but allow correction before submission.
- Admin create/edit forms may expose only the minimum fields needed for the loop -> document this as lightweight management and keep unsupported heavy CMS features out of scope.
- Report detail shape can vary by template -> reuse the privacy-safe report projection used for student/share views and render sparse payloads defensively.
- Coverage may drop as UI complexity grows -> add focused helper-level tests for form reducers/mappers and flow tests for user actions.

## Migration Plan

1. Add/verify Hono ops resource support for activity signups, report detail, and resource update payloads.
2. Add mini program signup API methods, signup form behavior, signup history page, and profile entries.
3. Expand admin UI forms and report/signup views.
4. Run Taro, Hono, and admin tests/coverage/build gates independently.
5. Keep parent repo dependency-neutral and commit subproject changes independently when requested.
