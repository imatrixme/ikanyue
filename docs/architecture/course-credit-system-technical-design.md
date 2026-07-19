# 看乐课程点消费系统技术设计

## 1. 文档范围

本设计将 PRD 中的购买、批次、激活、兑换、班级、课堂、学员消费和教师课堂点落实为跨四端架构。本文定义权威写入边界、数据模型、状态机、API、迁移和验证，不包含具体页面视觉稿。

## 2. 当前系统事实

### 2.1 历史模型

- 旧 Hono 分支在 `students`、`teachers` 上保存单一 `hours`，没有课程类型和流水。
- 签到分支使用 `lesson_records`、`attendance_records`，课程与学员关系接近一对一，签到不触发权益结算。
- 旧 Admin 完整分支已有 `learning_programs`、`learning_sessions`、`program_students`、`program_teachers`、`session_students`、`session_teachers`，但把班级和课包混为一个对象。
- 当前轻量积分使用 `student_points` 快照和 `point_events` 事件，适用于实物兑换，不适用于课程点。

### 2.2 一致性缺口

当前 `PointService.applyDelta` 先更新余额快照，再创建事件，两次 PocketBase JS SDK 请求没有跨集合事务。如果第二步失败，会出现余额变化但缺少事件；并发请求也可能读取相同旧余额。

课程点兑换和课堂结算通常同时修改多个批次、分配记录、流水、课堂状态和通知事件，因此不得复用该写入方式。

## 3. 目标与非目标

### 3.1 目标

- 任何课程点命令在一个数据库事务内完成或完全回滚。
- 使用不可变操作和事件提供审计，使用批次快照提供高效查询。
- 支持通用点、特定课程点、批次有效期、首次使用激活和有向兑换。
- 支持多班合课、多学员名单快照、多教师实际结算。
- 四端只通过 Hono API 使用领域能力，不直接访问 PocketBase 私有集合。
- 所有命令具备幂等、权限、审计、对账和失败恢复机制。
- 所有受影响项目的行、分支、函数和语句覆盖率分别达到 95% 以上。

### 3.2 非目标

- 不在第一阶段统一实物积分和课程点。
- 不把官网变成私有账户客户端。
- 不通过前端补偿事务失败。
- 不在实现过程中恢复旧完整 Admin 的全部教务功能。
- 不在常规开发循环中使用 Docker；仅在最终发布前进行容器化验证。

## 4. 总体架构

```text
Admin / Mini Program / Website
              |
              v
       Hono API and RBAC
       - request validation
       - identity and scope
       - query composition
       - domain services
       - transaction planning
              |
              v
PocketBase JavaScript SDK
       - pb.createBatch()
       - one transactional /api/batch request
              |
              v
      PocketBase SQLite/S3
```

PocketBase 官方 Batch API 支持在一个请求中事务化创建、更新、upsert 或删除多条记录；当前 JavaScript SDK 通过 `pb.createBatch()` 构造该请求。Batch API 必须在 PocketBase Application Settings 中显式启用；课程积分功能启用时，Hono 启动检查未通过就拒绝启动。参考：[PocketBase batch records API](https://pocketbase.io/docs/api-records/#batch-createupdateupsertdelete-records)。

## 5. 关键技术决策

### 5.1 账本业务在 Hono 执行，PocketBase 只提供事务存储

所有课程点规则、权限、幂等判断、FEFO 规划和状态机都在 Hono service 中执行。事务仓储使用现有 PocketBase JavaScript SDK 的 `createBatch()`，一次性提交账本集合变更。PocketBase 不实现任何后端业务 hook；记录生命周期、自定义路由、定时任务和 hook 内事务都禁止使用。

选择原因：

- 保留当前 PocketBase 数据和运维体系。
- 通过 PocketBase 官方 Batch API 在同一个读写事务内更新多个集合。
- 避免新增独立数据库和双写同步。
- 保持现有 Hono service/repository 与 PocketBase SDK 的项目结构。

备选方案：

- Hono 顺序 SDK 写入与补偿事务：不能消除部分写入，拒绝。
- PocketBase 业务 hook：会把 API 层业务规则下沉到存储层，拒绝。
- 新增 PostgreSQL：一致性更强、扩展性更好，但会增加基础设施和数据同步，暂不采用。
- Hono 本地 SQLite：容器持久化、备份和多实例写入风险较高，拒绝。

生产卷副本已确认运行 `elestio/pocketbase:v0.32.0`，其 Batch API 配置为启用状态。Hono 启动时只校验 SDK 能力与 `batch.enabled=true`，具体限额保留为运行诊断信息，不进入业务分支。迁移、Hono transaction repository、能力探针和契约测试全部纳入 `ikanyue.mapi.hono` 版本控制。

`ikanyue.mapi.hono` 提供仓库级无 hook 守卫并接入 lint：禁止 `pb_hooks`、`.pb.js`、PocketBase hook API 和 `--hooksDir` 等运行配置。Record hook 的状态机和不可变约束由 Hono domain service 与 transaction repository 承担；bootstrap hook 被 Hono 启动期 Batch API 强制校验替代；custom serve hook 被显式 Hono route 替代；cron hook 被外部调度器调用 `POST /ops/course-credits/workers/expiry/run`、`POST /ops/course-credits/workers/outbox/deliver` 和对账 route 替代。PocketBase 只接收 SDK 读请求与 `createBatch().send()` 事务写入。

### 5.2 命令与查询分离

命令 API 只返回操作结果和必要快照；列表、总览和报表由查询服务读取批次与投影。所有高风险命令必须创建 `credit_operations`，查询可按操作追踪完整链路。

### 5.3 事件不可变，批次为查询快照

- `credit_events` 不允许更新和删除。
- `credit_batches` 保存可用、冻结、消费、过期等聚合数量，随事务更新。
- 对账任务按事件和分配重建批次余额，与快照比较。
- 发现差异时标记异常，不自动覆盖历史事件。

### 5.4 班级、商品与课堂分离

- `course_specs` 定义可消费课程规格。
- `packages` 定义销售商品和发放内容。
- `classes` 定义教学组织。
- `sessions` 定义一次真实课堂。

旧 `learning_programs` 不再同时承担班级和课包职责。

### 5.5 每个课堂快照结算规则

课堂发布时快照 `required_credit_type_id`、`required_quantity`、出勤规则、取消规则和教师规则版本。教师角色规则可以显式携带机构取消补偿数量及适用的实际教师状态；未配置即不补偿。规则后续变化不影响已发布课堂。

### 5.6 外部调用使用事务外 Outbox

支付验证在账本事务前完成；通知、短信、订阅消息和分析事件在事务内写 `outbox_events`，事务提交后异步发送。事务内不得发起外部 HTTP 请求。

外部单实例 worker 调用 Hono Outbox service：先把到期事件标记 `processing`，再使用事件 ID 作为提供方幂等键投递。失败按指数退避进入 `failed`，达到配置上限进入 `dead_letter`；超过处理超时的 `processing` 事件可重新领取。管理接口只返回 topic、聚合标识、尝试次数和安全错误码，不返回原始 payload。

## 6. 数据模型

完整集合字段、索引、数量约束、关系和删除策略见 `docs/architecture/course-credit-system-data-model.md`。架构实现必须同时满足该数据字典与本文件定义的事务和状态机约束。

## 7. 状态机

### 7.1 批次

```text
pending -> unactivated -> active -> depleted
                         -> expired
pending/unactivated/active -> cancelled
```

### 7.2 课堂学员

```text
scheduled -> credit_insufficient
scheduled -> reserved -> checked_in -> present/late -> settled
reserved -> leave/cancelled -> released
reserved -> absent -> consumed/released by rule
```

出勤状态和课程点状态使用独立字段；不得用一个状态同时表达两者。

### 7.3 课堂

```text
draft -> scheduled -> enrollment_closed -> in_progress -> completed -> settled
scheduled/enrollment_closed/in_progress -> cancelled
settled -> correction_pending -> settled
```

## 8. 核心命令

### 8.1 `grantOrderCredits`

1. 以支付事件或订单号构造幂等键。
2. 锁定/读取订单并验证 `paid`。
3. 创建 `credit_operation`。
4. 按发放快照创建一个或多个批次。
5. 写 `GRANT` 事件和 Outbox。
6. 标记订单 `granted` 并提交。

### 8.2 `convertCredits`

1. 验证规则版本、时间、方向和数量步长。
2. 按 FEFO 选择来源批次并验证未冻结、未过期。
3. 根据每个来源批次计算目标有效期与激活状态。
4. 创建目标批次和 `conversion_allocations`。
5. 在同一事务写 `CONVERT_OUT`、`CONVERT_IN`。
6. 若为隐式兑换，同一事务继续执行目标课堂冻结。

任何步骤失败都必须回滚，不允许目标批次孤立存在。

### 8.3 `reserveSessionCredit`

1. 使用 `session_student_id` 构造幂等键。
2. 验证课堂未取消、学员名单有效、课程点类型完全匹配。
3. 按 `effective_expires_at ASC, priority ASC, created ASC` 分配批次。
4. 未激活批次必须满足激活截止日和课堂时间条件。
5. 更新批次 `available -> frozen`，创建 allocation 和事件。
6. 将课堂学员 `credit_status=reserved`。

当请求携带有效 `authorizationId` 且精确课程点不足时，Hono 在同一个 SDK Batch 中继续执行：来源批次 `available -> consumed`、目标批次创建、目标批次 `available -> frozen`、`conversion_allocations`、`session_credit_allocations`、不可变事件、课堂学员版本更新和 Outbox。任何一个请求失败时整批回滚；不得先调用独立兑换接口再调用预约接口。

### 8.4 `rescheduleSession`

1. 只允许 `scheduled` 或 `enrollment_closed` 课堂改期，使用课堂版本声明防止并发覆盖。
2. 对每个 `credit_status=reserved` 的课堂学员，按新 `start_at` 重新验证原 allocation；批次有效期使用 `[valid_from, effective_expires_at)` 半开区间。
3. 仍有效的 allocation 只更新 `reserved_for_start_at`；失效 allocation 从 `frozen` 释放。
4. 若释放时批次已经到期，数量直接进入 `expired`，不得短暂回到 `available`；否则进入 `available`。
5. 按新课堂时间重新执行 FEFO。只有缺口可以被完整覆盖时才创建新冻结，不能留下部分新冻结和 `credit_insufficient` 的混合状态。
6. 课堂时间、批次桶、旧/new allocation、课堂学员状态、不可变事件、操作记录和 Outbox 在同一个 SDK Batch 中提交。

### 8.5 `activateBatch`

激活触发事件必须与批次策略一致。使用批次版本防止重复激活，写入 `activated_at`、`effective_expires_at` 和 `ACTIVATE` 事件。激活后重新检查未来冻结是否超出新有效期。

### 8.6 `settleSession`

1. 验证课堂为 `completed` 或机构 `cancelled`，通过课堂、课堂学员和批次版本声明防止并发重复结算。
2. 对每个学员根据课次快照消费或释放冻结：`present`、`late`、`leave`、`absent` 从 `attendance_rule_snapshot` 取动作，学员级 `cancelled` 从 `settlement_rule_snapshot` 取动作；动作只能是 `consume` 或 `release`。
3. 同一学员只处理一个 `session_student`，即使关联多个班级。
4. 完成课堂必须为所有学员提供完整冻结量，并至少有一名 `actual_status=confirmed` 的主讲。机构取消只释放现有冻结，不产生正常教师收益。
5. 对每个已确认实际教师读取 `teacher_rule_snapshot.rules[role]`，按 `base_quantity + duration_hours * duration_factor + participant_count * participant_factor` 计算收益，保留 6 位并生成独立 `pending` 事件。实到人数只统计 `present` 和 `late`。
6. 写学生事件、教师 pending 事件、操作审计和 Outbox，将课堂标记 `settled` 并保存 `settlement_operation_id`。

`scheduled` 和 `checked_in` 不是最终出勤事实，必须拒绝结算。机构取消的课堂无条件释放所有学员冻结，不允许快照覆盖为消费。单学员规划只改变 `credit_status`、allocation 状态和批次桶，不改写 `attendance_status`；整堂课事务由 `settleSession` 命令统一组合。

上述所有写入只调用一次 PocketBase JS SDK `createBatch().send()`。任一教师事件、学生批次、allocation、session 或 Outbox 请求失败时，PocketBase 回滚整个请求；Hono 不执行补偿写。

机构取消不会创建普通 `earn`。只有课堂的版本化 `teacher_rule_snapshot` 对角色配置了 `cancellation_compensation`，且实际教师状态在规则白名单中时，结算才创建 `compensate` pending 事件。教师数量独立计算，不要求与学员释放数量守恒。

### 8.7 `reverseSessionSettlement`

1. 只允许冲正已提交的 `settle_session` 操作，并通过 `reversal_of_operation_id` 建立唯一追溯关系。
2. 不修改原 `credit_events`、`teacher_credit_events` 或 allocation。每个原消费/释放事件生成链接 `reversal_of_event_id` 的 `REVERSE` 事件。
3. 原消费或释放数量从 `consumed|available|expired` 回到 `frozen`；原 allocation 标记 `reversed`，同时创建替代 `reserved` allocation，避免改写历史事实。
4. 原教师收益生成负数 `reverse` 事件，原教师事件保持不变；课堂教师状态标记为已冲正。
5. 课堂进入 `correction_pending`，并在 `correction_base_status` 保存原 `completed|cancelled` 事实。
6. 冲正的批次、allocation、学员/教师状态、反向事件、操作审计、课堂和 Outbox 在一个 SDK Batch 中提交。

修正出勤或教师事实后再次调用 `settleSession`。重结算使用 `correction_base_status` 作为有效课堂状态，生成新的结算操作和事件，成功后清空该字段并替换 `settlement_operation_id`。任何原终态桶数量已被后续操作占用时，冲正拒绝执行，不通过补偿写掩盖冲突。

### 8.8 `expireBatches`

外部调度器调用 Hono 到期 service，按业务时区找到到期批次，将未冻结可用量转为过期量。已冻结量按 `reserved_for_start_at` 判断：服务时间有效则保留，否则释放后过期。不得使用 PocketBase cron hook。

### 8.9 `confirmTeacherCredit`

1. 只允许 Hono 认证后的管理员确认 `pending` 状态的 `earn|compensate` 事件，并要求审计原因和幂等键。
2. 原收益事件保持不变，创建同数量的 `confirm` 事件，通过 `confirmation_of_event_id` 唯一关联原事件。
3. 同一事务把 `session_teachers.credit_status` 更新为 `confirmed`，并写操作记录和 Outbox。
4. 同一收益使用不同幂等键重复确认时，由唯一关联和服务校验共同拒绝；同一请求重试返回原结果。

## 9. API 设计

### 9.1 学员 API

- `GET /v1/course-credits/summary`
- `GET /v1/course-credits/batches`
- `GET /v1/course-credits/batches/:batchId`
- `GET /v1/course-credits/events`
- `GET /v1/course-credits/conversion-rules`
- `POST /v1/course-credits/conversions/preview`
- `POST /v1/course-credits/conversions`
- `GET /v1/course-credits/sessions`
- `POST /v1/course-credits/session-students/:sessionStudentId/reserve`

学员身份只从认证上下文读取。批次、事件和课堂查询不接受客户端 `studentId`，响应排除原始发放快照、事件 metadata 和其他学员信息。

### 9.2 Admin API

- `/ops/course-credits/catalog/course-specs`
- `/ops/course-credits/catalog/credit-types`
- `/ops/course-credits/packages`
- `/ops/course-credits/price-versions`
- `/ops/course-credits/orders`
- `/ops/course-credits/accounts`
- `/ops/course-credits/conversion-rules`
- `/ops/course-credits/classes`
- `/ops/course-credits/sessions`
- `/ops/course-credits/settlement-exceptions`
- `/ops/course-credits/teacher-events`
- `/ops/course-credits/reconciliation/runs`
- `/ops/course-credits/reconciliation/exceptions`

以上工作区均提供分页列表和受能力约束的详情接口。查询只返回显式白名单字段，不透传规则 metadata、商品/发放快照或支付 provider payload；变更继续使用显式命令路由，未确认产品规则前不开放任意资源 CRUD。

高风险命令使用显式 action endpoint，例如：

- `POST /ops/course-credits/batches/:batchId/extend`
- `POST /ops/course-credits/batches/:batchId/restore-expired`
- `POST /ops/course-credits/orders/:orderId/grant`
- `POST /ops/course-credits/sessions/:sessionId/reschedule`
- `POST /ops/course-credits/sessions/:sessionId/settle`
- `POST /ops/course-credits/sessions/:sessionId/reverse-settlement`
- `POST /ops/course-credits/reconciliation/runs`
- `POST /ops/course-credits/teacher-events/:teacherCreditEventId/confirm`
- `POST /ops/course-credits/workers/expiry/run`
- `POST /ops/course-credits/workers/outbox/deliver`

`reverse-settlement` 是已结算课堂重新进入修正流程的唯一入口；它先追加冲正事件并将课堂置为 `correction_pending`，不直接改写原结算事实。

worker route 只负责受控触发 Hono service，不接受任意集合名、过滤器或写入计划。到期 worker 使用结算能力，Outbox worker 使用审计能力；调度账号仍需通过 Hono 认证。到期扫描按批次独立提交一个 SDK Batch，保留服务时间仍有效的冻结 allocation，并把失效 allocation、对应课堂学员状态、事件、审计和 Outbox 一次性提交。

### 9.3 通用协议

- 所有命令接受 `Idempotency-Key`，服务端同时保存用户、路由和业务对象组成的作用域。
- 响应包含 `operationId`、`traceId` 和当前结果，不返回可被客户端修改后重放的余额字段。
- 失败响应保留稳定 `errorCode`、`traceId` 和可用的 `operationId`；缺少操作记录时 `operationId=null`。
- 时间使用 ISO 8601 UTC；业务有效期计算使用配置的 `Asia/Shanghai` 时区。
- 业务错误使用稳定代码，例如 `CREDIT_TYPE_MISMATCH`、`CREDIT_INSUFFICIENT`、`BATCH_EXPIRED`、`CONVERSION_RULE_INACTIVE`、`SESSION_ALREADY_SETTLED`。

## 10. 四端职责

### 10.1 `ikanyue.mapi.hono`

- 身份认证、RBAC、输入校验、领域服务、查询聚合和 PocketBase SDK batch transaction。
- 版本化 PocketBase migrations、事务仓储、Batch API 能力探针和契约测试。
- Hono worker/service 承载到期、Outbox、对账等被调度任务；PocketBase 只持久化任务状态。
- 禁止普通资源 CRUD 直接修改账本集合。
- `price_versions`、`conversion_rules`、`teacher_credit_rules` 只允许创建新版本，草稿修改、发布和停用都不得原地 update/upsert/delete。

### 10.2 `ikanyue.admin`

- 使用表格/列表承载总览，抽屉或弹窗承载详情和命令确认。
- 课程、套餐、规则、批次、课堂和结算按工作区分组。
- 高风险操作展示预演结果，不允许直接编辑余额字段。

### 10.3 `ikanyue.taro3`

- 展示学员自己的账户、批次、到期、兑换和课堂资格。
- 隐式兑换必须展示确认，不在前端计算权威比例。
- 刷新和分页复用现有页面模式，所有余额来自后端查询。

### 10.4 `ikanyue.website`

- 读取公开课程与套餐投影。
- 不持有管理凭据，不读取私有账户，不执行账本命令。

## 11. 安全与权限

- PocketBase 账本集合默认禁止公开 API 写入。
- Hono 当前使用仅服务端持有的 PocketBase superuser 凭据调用 SDK；客户端永远不能取得该凭据或直接调用 Batch API。若后续引入可覆盖私有集合与 Batch API 的最小权限服务身份，再单独迁移并轮换凭据。
- 课程点权限拆分为 `academic`、`finance`、`settlement`、`audit`、`teacher`、`student`、`guardian` 七类能力。超级管理员拥有全部运营能力，普通教师必须显式授权；越权拒绝写入 `ops_audit_logs`，审计存储故障不得放行原请求。
- 学员 ID 从认证上下文获取，不能由客户端替换。
- 规则发布、延期、冲正和教师收益调整需要二次确认与原因。
- 日志不得记录支付密钥、完整手机号、身份证件和 PocketBase 管理凭据。

## 12. 并发、幂等和性能

- SQLite 事务只有单写者，命令必须短小，事务内禁止外部请求和大列表扫描。
- 批次选择使用覆盖索引并限制单次兑换/冻结涉及的批次数量。
- 重复命令通过 `credit_operations.idempotency_key` 返回原结果。
- 批量课堂结算按课堂拆分事务，不使用一个事务结算无限数量课堂。
- 查询使用账户投影和分页，不在请求时全量重放事件。
- 对热点学员账户进行串行命令处理；事务仍是最终一致性保障。

## 13. 对账与可观测性

- 每个已提交命令写 `operationId`、`traceId`、`reason`、`outcome` 和隐私安全的前后摘要。摘要过滤手机号、姓名、邮箱、地址、认证令牌、密钥、原始 payload/metadata；数组只保存数量，长文本限制长度。
- 指标包括命令成功率、冲突重试、结算失败、余额不足、过期量、Outbox 积压和对账差异。
- 命令成功、失败、幂等/版本冲突、余额不足和结算失败使用进程级计数器；过期量、余额不足预约、Outbox backlog/lag 和未解决对账差异从 PocketBase 持久状态实时聚合，并通过 `GET /ops/course-credits/metrics` 暴露给审计能力用户。
- 每日按学员与批次重建余额；发布初期增加逐小时增量对账。
- 全量对账读取全部批次；增量对账合并指定时间后更新的批次和新增事件涉及的批次。
- 重建只使用事件的 `bucket_from`、`bucket_to` 和数量，并以 allocation 校验冻结量，不信任事件中的余额快照。
- 桶差异、守恒错误、非法或重复事件、allocation 差异写入 `reconciliation_exceptions`；对账不得静默更新批次或历史事件。
- 差异进入 Admin 异常中心，只允许通过冲正/调整命令修复。

## 14. 迁移方案

### 14.1 准备

1. 固定 `release/2.0.0`，禁止继续增加 `students.hours` / `teachers.hours` 写逻辑。
2. 建立新集合、索引、Hono transaction repository 和只读查询。
3. 对旧 `learning_*` 集合和实际 PocketBase schema 做生产前盘点。

### 14.2 数据迁移

- `students.hours` 只能作为待核对历史余额，不能自动判断课程类型。
- 每个历史学员必须由管理员选择课程类型、来源说明和有效期后，生成 `migration` 批次。
- `teachers.hours` 迁移为独立教师调整事件，不能进入学员账本。
- 旧 `learning_programs` 按业务确认拆成 `classes` 或 `packages`；不允许按名称自动猜测。
- 旧 `learning_sessions`、出勤和教师关系可迁移为历史课堂，但默认不自动补扣课程点。

### 14.3 Shadow 验证

1. 新系统先只记录模拟冻结/结算结果，不影响旧业务。
2. 用真实课堂样本核对名单、点数和教师收益。
3. 对账连续通过后开启新订单发放。
4. 再开启课堂冻结和结算。
5. 最后开放兑换。

### 14.4 回滚

- 关闭 Hono 新命令路由和规则发布，不删除新数据。
- 已提交的新账本事件不反写旧 `hours`。
- 通过 feature flag 暂停冻结/结算，保留查询和导出用于人工处理。
- 修复后从最后成功操作继续，不直接重跑无幂等键脚本。

## 15. 验证策略

### 15.1 后端

- 领域单元测试：有效期、激活、FEFO、兑换图、出勤规则。
- PocketBase SDK Batch API 集成测试：启用状态、事务回滚、重复命令、真实发放与预约。
- 契约测试：Hono service/repository 请求计划、权限和错误码。
- 属性测试：任意操作序列后批次数量守恒且不为负。
- Hono API、领域服务和 SDK transaction repository 受影响代码的 lines、branches、functions、statements 分别不得低于 95%。
- 批次守恒、兑换、有效期、冻结、结算和冲正内核的关键分支必须完整覆盖。
- 关键失败矩阵必须有具名测试：输入校验、权限拒绝、重复命令、Batch 回滚、并发预约、半开区间到期边界、结算冲正和对账差异；真实 PocketBase 事务测试在本地容器可用时运行，纯服务测试始终运行。

### 15.2 Admin

- 商品、规则、班级、课堂和异常结算流程测试。
- 高风险确认、权限缺失、并发冲突和失败恢复测试。
- 宽屏与窄屏布局验证。
- Admin 受影响代码的 lines、branches、functions、statements 分别不得低于 95%。

### 15.3 小程序

- 通用点不可消费、兑换确认、激活提示、到期展示和课堂资格测试。
- 微信开发者工具中验证刷新、分页、错误态和重复点击。
- 小程序受影响代码的 lines、branches、functions、statements 分别不得低于 95%。

### 15.4 官网

- 公开数据过滤、价格版本展示和无私有字段泄漏测试。
- 官网受影响代码的 lines、branches、functions、statements 分别不得低于 95%。

### 15.5 发布

- 日常验证使用本地服务，不使用 Docker。
- 每个子项目的覆盖率命令必须在本地独立失败于任一低于 95% 的指标，并输出可审计报告。
- 最终发布前才运行四端完整测试、覆盖率汇总、PocketBase migration 演练和 Docker 发布验证。

## 16. 风险与缓解

- PocketBase Batch API 未启用或版本不支持 -> Hono 启动检查失败并停止课程积分服务，先修正存储配置再发布。
- SQLite 单写者限制高峰结算 -> 保持短事务、按课堂拆分、队列化热点账户。
- 兑换环产生套利 -> 发布前图检测、参考价值上限、默认不可逆。
- 首次签到激活与取消产生歧义 -> 明确激活事件，候选课堂取消不激活。
- 历史 `hours` 无法识别课程 -> 只做人工映射迁移，不自动猜测。
- 规则配置过于复杂 -> Admin 提供预演、样例结果和发布检查清单。
- 事件和快照漂移 -> 定期重建对账和异常中心。

## 17. 后续业务待确认

- 通用课程点计量单位和是否自身过期。
- `FIRST_CHECK_IN` 与 `FIRST_COMPLETED_SESSION` 的最终默认选择。
- 请假、迟到、缺席和机构取消规则矩阵。
- 支付渠道、监护人付款和订单撤销审批流程。
- 特定课程点允许的兑换方向与参考价值算法。
