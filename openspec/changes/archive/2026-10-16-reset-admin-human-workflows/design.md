## Context

The current admin UI has useful pieces: authenticated ops access, role-specific dashboard variants, guided operations, project and lesson scene workspaces, data maintenance tables, rich editing surfaces, and tests. The problem is not the absence of capability; the problem is that those pieces compete for the operator's attention.

Administrators and teachers do not enter the system to operate tables. They enter because a real-world workflow is waiting: a signup needs review, a student needs to be placed, a class needs a teacher and room, a lesson needs attendance, or a report needs to be written and published. The UI must therefore make the lifecycle visible first and keep raw collection maintenance secondary.

## Goals / Non-Goals

**Goals:**

- Rebuild the admin navigation around the teaching operations lifecycle.
- Make the dashboard a role-specific work queue and lifecycle board.
- Reduce guided operation entry points into a small set of human motives.
- Use business-facing labels for programs, sessions, report tasks, generated reports, and miniapp placements.
- Preserve relation tables and generic resource tables as an advanced data center, not the ordinary path.
- Add tests that prove the navigation, queue, flow grouping, and data-center boundaries.

**Non-Goals:**

- No PocketBase schema migration.
- No backend route redesign.
- No Docker/deployment change.
- No miniapp or Flutter implementation.
- No automatic commit before user validation.

## Decisions

### Decision: Lifecycle navigation owns the shell

The admin shell will group navigation around human work stages:

1. 工作台
2. 招生转化
3. 班级与课包
4. 排课与上课
5. 测评与报告
6. 学员档案
7. 内容与小程序
8. 数据中心
9. 系统设置

Alternative considered: keep current groups and only rename labels. That would reduce visible friction but would not fix the underlying problem that relation tables and raw resources still compete with scenes as ordinary destinations.

### Decision: Data center is explicit and advanced

Raw resources such as project students, project teachers, lesson students, lesson teachers, report instances, report events, and audit logs remain accessible to administrators but are grouped under a data center. The data center copy explains that normal work should start from lifecycle pages or scene actions.

Alternative considered: hide raw resources completely. That is too risky during the current admin build-out because operators still need repair and inspection paths while the scene workflows mature.

### Decision: Dashboard starts from pending work

The admin dashboard will expose work queues such as pending signups, conversion candidates, schedule gaps, upcoming lessons, attendance work, report work, and miniapp publishing readiness. Teacher dashboards will expose today's lessons, students, and pending feedback/report work.

Alternative considered: keep metric cards as the primary dashboard. Metrics are useful, but they do not tell a human operator what to do next.

### Decision: Guided operations are motive groups, not a card dump

Guided operations will be grouped under a small set of primary motives:

- 发布招生活动
- 处理报名转化
- 创建班级/学习单元
- 安排一堂课
- 记录上课结果
- 发起测评/报告

Existing detailed workflows can remain as subchoices inside those motives. Content and miniapp publishing flows are moved into the content area rather than competing with teaching operations on the main workbench.

Alternative considered: add more tabs around the existing workflow cards. Tabs would organize the clutter but still force operators to understand too many equal-weight processes at once.

### Decision: Labels translate the data model

The code can keep existing resource names, but UI labels must translate them into the domain language operators use. For example, `learningPrograms` becomes 班级/学习单元, `learningSessions` becomes 课堂/场次, `reportEvents` becomes 报告任务, and relation tables become membership or attendance maintenance inside the data center.

Alternative considered: rename collections or routes. That would create backend and migration risk without being necessary for the first UI reset.

### Decision: Verification covers interaction intent

Tests must verify not only that pages render, but that the hierarchy hides advanced data first, teachers see task-oriented surfaces, guided workflows are grouped by motive, and data tables are clearly marked as advanced diagnostics.

Alternative considered: rely on snapshots or broad app rendering tests. That would miss the failure mode that caused this reset: the UI can render successfully while still making the wrong mental model dominant.

## Risks / Trade-offs

- [Risk] Moving raw resources into a data center may temporarily slow administrator repairs. → Mitigation: keep data center visible to administrators and preserve direct search/table behavior there.
- [Risk] Renaming concepts can confuse existing internal docs or tests. → Mitigation: keep internal resource identifiers stable and translate only the UI labels/copy.
- [Risk] Lifecycle grouping can become another abstraction if dashboard queues are weak. → Mitigation: base dashboard sections on concrete pending records and empty states with next actions.
- [Risk] Guided workflow consolidation can hide less common workflows. → Mitigation: expose detailed workflows as subchoices under motive groups and keep search/filtering inside guided operations.
