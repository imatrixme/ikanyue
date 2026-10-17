## Why

The admin system has accumulated scene workspaces, guided flows, data tables, and role-specific entry points, but those surfaces now expose competing mental models. Operators still need to translate low-level records such as projects, sessions, relation tables, report events, and operation slots into the real work they came to finish.

This change resets the admin information architecture around the teaching operations lifecycle so administrators and teachers can understand what needs attention, act from known context, and verify the downstream effect without learning the database structure first.

## What Changes

- Reframe the authenticated admin hierarchy around human work stages: workspace,招生转化,班级与课包,排课与上课,测评与报告,学员档案,内容与小程序,数据中心,系统设置.
- Move low-level relation and diagnostic resources out of ordinary navigation and into an advanced data center.
- Replace the generic dashboard emphasis with role-specific work queues and a lifecycle board that surfaces pending signups, conversion, scheduling gaps, attendance, feedback/report work, and miniapp publishing readiness.
- Consolidate guided operations into a small set of primary human motives instead of exposing many equal-weight process cards.
- Rename user-facing concepts so operators see business terms such as 班级/学习单元,课堂/场次,报告任务,已生成报告,小程序投放位 rather than raw collection-oriented names.
- Preserve data maintenance tables as an administrator-only diagnostic surface, clearly separated from normal scene work.
- Keep current backend APIs and PocketBase schema stable; this change reshapes the admin UI and tests first.

## Capabilities

### New Capabilities
- `admin-human-workflow-ux`: Defines the operator-centered admin hierarchy, role work queues, lifecycle board, motive-based guided flows, and data-center separation.

### Modified Capabilities
- `ops-admin-system`: Update the admin UI requirements so the first-phase admin system prioritizes lifecycle workspaces and advanced data maintenance boundaries.
- `subproject-unit-test-coverage`: Extend admin tests to cover lifecycle navigation, role work queues, flow grouping, and data-center separation.

## Impact

- Affected project: `ikanyue.admin`.
- Affected UI modules: navigation/resource configuration, shell sidebar, dashboard, guided operations workspace, resource/data maintenance views, app access filtering, display labels, and tests.
- No backend API, PocketBase schema, Docker, deployment, miniapp, or Flutter work is included.
- The parent repository remains dependency-neutral; code and dependency changes stay inside subprojects when needed.
