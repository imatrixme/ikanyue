## Context

- 学员课时：
  - 课时批次记在学员名下，课时类型绑定课程（`creditTypeId → courseSpecId`），不绑定老师；
  - 换老师、老师离职都不需要转移课时。
- 课与老师：
  - 每节课的老师是 `session_teachers` 行：`role`（lead / assistant / observer / evaluator）、`assignmentSource`（class_default / appointment / session_override / substitute）、`actualStatus`（planned / confirmed / absent / cancelled）；
  - 唯一索引 `(sessionId, teacherId, role)`；
  - 学员约课确认后，`materializeAppointment` 生成一行主讲：`assignmentSource: appointment`、`actualStatus: planned`；
  - `substitute` 只能在建课时通过 override 传入，课建好以后没有换人的命令。
- 已经跟着 `session_teachers` 走的：
  - 老师日历（`teacherEntries`）过滤掉 `cancelled` 行；
  - 工作台待确认列表按 `session_teachers` 过滤，`confirmLesson` 只确认计划中的行；
  - 结算课酬（`planTeacherEarnings`）只算 `confirmed` 的行；
  - 续课提醒（`teacherRenewals`）按老师最近的 `session_teachers` 推算。
- 还没跟着走的：
  - 学员课程视图（`loadLessonContexts`）读取全部老师行，包括 `cancelled`；
  - 学员和老师的预约视图显示 `appointments.teacherId`，即约课时的老师；
  - 老师改期或取消预约，校验的是 `appointments.teacherId`。
- 约课申请：`pending` 的预约由老师确认或婉拒；`declineAppointment` 要求写原因，管理员可以代为婉拒。
- 开放预约：`teacher_course_offerings`（老师 × 课程，`status` active / inactive）和 `teacher_availability_rules`。学员只能约 `active` 的预约配置。
- 老板就是 `isAdmin` 教师；工作台管理类接口用 `managing(e, administrator)` 每次请求重新读取教师记录。

## Goals / Non-Goals

**Goals**
- 老板在小程序里给任意一节未确认的课换主讲老师，代课老师确认上课，课酬记给代课老师。
- 老师离职时，老板一步完成交接：课改由接手老师上，约课申请婉拒，开放预约关闭，账号停用。
- 学员看到的是实际上课的老师。

**Non-Goals**
- 老师自助调课、改已结算课的老师、离职课酬结清、推送通知、归属老师、课时转移。

## Decisions

### 1. 换老师 = 取消原行 + 加代课行

`substituteTeacher(sessionId, teacherId, reason?)`：

- 适用的课：
  - 课节状态为 scheduled / enrollment_closed / in_progress / completed / correction_pending；
  - `settled` 返回 `SESSION_ALREADY_SETTLED`，提示先撤销确认；
  - `cancelled` / `draft` 返回 `SESSION_NOT_EDITABLE`；
  - 迁移来的课（`originType: migration`）不换。
- 当前主讲 = 这节课 `role=lead` 且 `actualStatus` 为 `planned` / `confirmed` 的行（实现时确定）：
  - 这些行全部改为 `cancelled`；
  - `absent`（已记缺席）的主讲行保留原状，作为出勤记录；
  - 没有当前主讲（例如原主讲已缺席）时，直接加上新老师，不再要求恰好一行（原设计的 `SESSION_LEAD_REQUIRED` 取消）。
- 新老师必须在职（`verified=true && blocked=false`，否则 `TEACHER_INACTIVE`）：
  - 已是当前主讲时返回 `SUBSTITUTE_SAME_TEACHER`；
  - 已以其他角色在这节课上时返回 `SUBSTITUTE_TEACHER_ASSIGNED`。
- 冲突检查：
  - 新老师在这节课的时间段内，已有别的未取消课节（`session_teachers` 中 planned / confirmed 的行，时间重叠）或占用中的日历格，返回 `SUBSTITUTE_TEACHER_BUSY`，`details` 带冲突课的时间；
  - 已开课的课（补记代课）同样检查，避免一个人同时上两节课；
  - 提交时撞上日历格唯一索引也映射为 `SUBSTITUTE_TEACHER_BUSY`。
- 写入（一个事务，`prepareTeaching` 幂等）：
  1. 当前主讲行 `actualStatus → cancelled`；
  2. 新老师：
     - 这节课里已有他的 lead 行（以前被换下过）时，把那一行改回 `planned` 并把 `assignmentSource` 设为 `substitute`；
     - 否则新建一行 lead，`assignmentSource: substitute`、`actualStatus: planned`，`creditStatus` 沿用原主讲行的初始值（已确认/已冲正的重置为 `pending`）；
  3. 其他主讲（含缺席的）在这节课上的老师日历格（`schedule_claims`）释放，同样的格子改记到新老师名下；
  4. 课节版本号 +1，与其他课节命令串行；
  5. 课节审计 `substitute_teacher`，记录原老师、新老师、原因；
  6. outbox `course-session.teacher-substituted`。
- 只换主讲。助教等其他角色不在小程序里管理。
- 学员名单、出勤、课时预留都不动，所以已开课但还没确认的课换完老师，代课老师可以直接「确认上课」。

**被否决的方案**：
- 直接改原行的 `teacherId`：会丢掉「原本是谁、被谁代」的记录，课酬和审计说不清。
- 新增「代课」集合：`session_teachers` 已经有 `substitute` 来源和 `cancelled` 状态，不需要新概念。

### 2. 预约跟着实际主讲走

- `appointments.teacherId` 保持约课时的老师，作为历史记录，不改。
- 预约已经生成课节时，学员和老师看到的「老师」取课节的当前主讲：
  - 学员的预约详情、课程列表与课程详情；
  - 学员课程视图过滤掉 `cancelled` 的老师行。
- 老师取消预约：预约已有课节时，要求执行者是课节当前主讲，否则返回 `APPOINTMENT_TEACHER_FORBIDDEN`；管理员不受限。
  - 结果：被换下的原老师不能再动这节课；
  - 代课老师也不能通过预约取消（预约不在他名下），改由老板处理。
- 改期（实现时收紧）：已换老师的课（当前主讲 ≠ 预约老师）任何人都不能直接改期，返回 `APPOINTMENT_TEACHER_SUBSTITUTED`。
  - 原因：可约时段和日历格属于预约老师的开放预约，直接改期会重新占用原老师的时间；
  - 老板先把课换回原老师再改期，或取消后让学员重新预约。

### 3. 离职交接 = 批量换老师 + 收尾

`handoverTeacher(teacherId, toTeacherId, reason)` 与预览 `handoverPreview(teacherId, toTeacherId)`：

- 前置条件：
  - 离职老师不能是 `isAdmin`（`HANDOVER_ADMIN_FORBIDDEN`），也不能是执行者本人；
  - 接手老师在职，且不是离职老师本人；
  - 原因必填，至少 4 个字。
- 预览返回：
  - `lessons`：离职老师作为主讲、未结算、未取消的课（含已开课待确认的），每节带时间、课程、学员；
  - `conflicts`：其中与接手老师已有课时间重叠的课；
  - `otherRoleCount`：离职老师作为其他角色的课的数量；
  - `pendingRequests`：离职老师待处理的约课申请（学员、时间）；
  - `offerings`：离职老师开放预约的课程，并标出接手老师还没有开放预约的课程；
  - `students`：涉及的学员（去重）。
- 执行（一个事务，幂等键沿用 `prepareTeaching`）：
  1. `conflicts` 非空时整单返回 `HANDOVER_CONFLICTS`，不做任何改动。老板先把冲突的课逐节换给别人，再交接。
  2. 每节主讲课按决定 1 换给接手老师，幂等子键 `key:lesson:<sessionId>`；
  3. 离职老师在其他角色上的行标为 `cancelled`；
  4. 每条待处理约课申请按管理员身份 `declineAppointment`，原因「老师已调整，请重新预约」；
  5. 离职老师的 `teacher_course_offerings` 设为 `inactive`，生效中的 `teacher_availability_rules` 结束；
  6. 教师账号 `blocked=true`；
  7. 审计一条 `teacher.handover`（`course_operations`），带各项数量和原因；outbox `teacher.handed-over`。
  - 婉拒约课申请的幂等子键为 `key:decline:<appointmentId>`。
- 预览和执行之间数据变了（例如又来了一条约课申请）没关系，执行时重新计算。返回值带实际处理的数量。
- 规模：小工作室一位老师未来的课通常是几十节，一个事务完成。超过 500 节返回 `HANDOVER_TOO_LARGE`，提示联系管理员在网页后台处理。

**被否决的方案**：
- 把待处理约课申请直接转给接手老师：接手老师的时间不一定合适，学员约的是具体的人和时间，婉拒后由学员重新约更真实。
- 交接时自动给接手老师创建开放预约：可约时间是老师自己设的，自动复制会产生他并不愿意的时段。

### 4. 权限

- 换老师、交接、老师列表、老师详情都要求 `isAdmin`，走 `managing(e, administrator)` 实时校验。
- 受雇老师没有任何换老师入口，也不能调用接口（403 `COURSE_CREDIT_ADMIN_REQUIRED`）。

### 5. 接口与暴露

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/v1/workbench/teachers` | `isAdmin`，实时校验 | 在职老师：姓名、是否管理员、未确认的课数、待处理约课数 |
| GET | `/v1/workbench/teachers/{teacherId}/lessons` | `isAdmin`，实时校验 | 这位老师作为主讲、未结算的课（开课前后都有） |
| POST | `/v1/workbench/lessons/{sessionId}/substitute` | `isAdmin`，实时校验 | `substituteTeacher` |
| GET | `/v1/workbench/teachers/{teacherId}/handover?toTeacherId=` | `isAdmin`，实时校验 | `handoverPreview` |
| POST | `/v1/workbench/teachers/{teacherId}/handover` | `isAdmin`，实时校验 | `handoverTeacher` |

- 写接口要求 `Idempotency-Key`。
- `mapi.json` 新增上述接口（默认策略组），与 `services/apis.js` 一致。

### 6. 小程序

- 工作台：
  - `sections.students && teacherCount > 1` 时出现「老师」模块，进入老师列表（实现为 `sections.teachers`）；
  - 一人工作室看不到任何换老师入口。
- 老师列表页：每位老师显示姓名、未确认的课数、待处理约课数。
- 老师详情页：
  - 他作为主讲的未确认课，每节有「换老师」；
  - 不是管理员、不是自己时，底部有「离职交接」。
- 换老师弹窗（可复用组件 `components/substitute-teacher`，工作台和老师详情页共用）：
  - 选择其他在职老师；只有两位老师时直接默认另一位；
  - 原因选填；
  - 冲突时显示「这位老师在这个时间已有课」。
- 离职交接：
  - 选接手老师 → 显示预览（几节课、几条约课申请会被婉拒、涉及哪些学员、接手老师还没开放预约的课程、冲突的课）→ 填原因 → `ui.confirm` 二次确认 → 完成后回到老师列表；
  - 有冲突时不能提交，冲突的课在同一页的课列表里单独换老师，换完后预览自动刷新。
- 待确认上课列表：老板（`allLessons`）在多老师时，每节课多一个「换老师」，用同一个弹窗。

## Risks / Trade-offs

- **代课老师不能改期或取消预约**：预约仍在原老师名下，取消由老板处理；已换老师的课谁都不能直接改期，要先换回或取消重约。小工作室里老板就在旁边，可以接受；以后如果需要，再把预约的处理权也转给代课老师。
- **交接停用账号后不能一键撤回**：逐节再换回和在网页后台重新启用账号都可以做到，预览和二次确认用来避免误操作。
- **离职老师的会话**：教学类接口看会话快照，停用后到会话过期前他仍能打开工作台。但他名下已经没有课，确认不了任何课。
- **课酬**：已结算的课的课酬仍归原老师；未结算课换人后课酬归代课老师。离职老师未确认的课酬不在本期处理。

## Migration Plan

- 不新增集合和字段，不迁移数据。
- 发布顺序：kanyue.server → 网关暴露清单上线 → 小程序。旧小程序看不到老师模块，不受影响。
