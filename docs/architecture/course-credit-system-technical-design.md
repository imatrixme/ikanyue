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

当前 `PointService.applyDelta` 先更新余额快照，再创建事件，两次 PocketBase REST 请求没有跨集合事务。如果第二步失败，会出现余额变化但缺少事件；并发请求也可能读取相同旧余额。

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
       - command forwarding
              |
              v
PocketBase transaction commands
       - JS hook routes
       - $app.runInTransaction
       - ledger/batch/session writes
       - outbox creation
              |
              v
      PocketBase SQLite/S3
```

PocketBase 官方 JavaScript 数据库扩展提供 `$app.runInTransaction(fn)`，事务回调无异常时才持久化，并要求事务内使用 `txApp`。参考：[PocketBase JavaScript database transactions](https://pocketbase.io/docs/js-database/#transaction)。

## 5. 关键技术决策

### 5.1 账本命令在 PocketBase 数据库边界执行

所有课程点写命令由 PocketBase 自定义 JS route/hook 执行，并使用 `$app.runInTransaction`。Hono 负责身份、输入验证和调用，不再通过通用 `OpsRepository` 逐条写账本集合。

选择原因：

- 保留当前 PocketBase 数据和运维体系。
- 在同一个 SQLite 事务内更新多个集合。
- 避免新增独立数据库和双写同步。

备选方案：

- Hono + REST 补偿事务：不能消除并发超卖，拒绝。
- 新增 PostgreSQL：一致性更强、扩展性更好，但会增加基础设施和数据同步，暂不采用。
- Hono 本地 SQLite：容器持久化、备份和多实例写入风险较高，拒绝。

实现前必须核对生产 PocketBase 版本是否支持所需 JS hook API，并将 hook 和 migration 源码纳入 `ikanyue.mapi.hono` 版本控制。

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

课堂发布时快照 `required_credit_type_id`、`required_quantity`、出勤规则、取消规则和教师规则版本。规则后续变化不影响已发布课堂。

### 5.6 外部调用使用事务外 Outbox

支付验证在账本事务前完成；通知、短信、订阅消息和分析事件在事务内写 `outbox_events`，事务提交后异步发送。事务内不得发起外部 HTTP 请求。

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

### 8.4 `activateBatch`

激活触发事件必须与批次策略一致。使用批次版本防止重复激活，写入 `activated_at`、`effective_expires_at` 和 `ACTIVATE` 事件。激活后重新检查未来冻结是否超出新有效期。

### 8.5 `settleSession`

1. 验证课堂 `completed`，锁定所有课堂学员和教师关系。
2. 对每个学员根据出勤规则消费或释放冻结。
3. 同一学员只处理一个 `session_student`，即使关联多个班级。
4. 对实际授课教师生成 `pending` 教师课堂点。
5. 写结算事件、审计、Outbox，将课堂标记 `settled`。

### 8.6 `reverseSessionSettlement`

不修改原事件。创建反向操作恢复批次桶、撤销教师收益并将课堂置为 `correction_pending`，修正事实后重新结算。

### 8.7 `expireBatches`

定时任务按业务时区找到到期批次，将未冻结可用量转为过期量。已冻结量按 `reserved_for_start_at` 判断：服务时间有效则保留，否则释放后过期。

## 9. API 设计

### 9.1 学员 API

- `GET /v1/course-credits/summary`
- `GET /v1/course-credits/batches`
- `GET /v1/course-credits/events`
- `GET /v1/course-credit-conversions/rules`
- `POST /v1/course-credit-conversions/preview`
- `POST /v1/course-credit-conversions`
- `GET /v1/teaching/sessions`
- `GET /v1/teaching/sessions/:id`
- `POST /v1/teaching/sessions/:id/reserve`

### 9.2 Admin API

- `/ops/course-specs`
- `/ops/credit-types`
- `/ops/packages`
- `/ops/price-versions`
- `/ops/orders`
- `/ops/course-credit-accounts`
- `/ops/course-credit-batches`
- `/ops/course-credit-conversion-rules`
- `/ops/classes`
- `/ops/sessions`
- `/ops/session-settlements`
- `/ops/teacher-credit-rules`
- `/ops/teacher-credit-events`
- `/ops/reconciliation-runs`

高风险命令使用显式 action endpoint，例如：

- `POST /ops/course-credit-batches/:id/extend`
- `POST /ops/course-credit-operations/:id/reverse`
- `POST /ops/sessions/:id/settle`
- `POST /ops/sessions/:id/reopen`

### 9.3 通用协议

- 所有命令接受 `Idempotency-Key`，服务端同时保存用户、路由和业务对象组成的作用域。
- 响应包含 `operationId`、`traceId` 和当前结果，不返回可被客户端修改后重放的余额字段。
- 时间使用 ISO 8601 UTC；业务有效期计算使用配置的 `Asia/Shanghai` 时区。
- 业务错误使用稳定代码，例如 `CREDIT_TYPE_MISMATCH`、`CREDIT_INSUFFICIENT`、`BATCH_EXPIRED`、`CONVERSION_RULE_INACTIVE`、`SESSION_ALREADY_SETTLED`。

## 10. 四端职责

### 10.1 `ikanyue.mapi.hono`

- 身份认证、RBAC、输入校验、查询聚合和 PocketBase 命令调用。
- 版本化 PocketBase migrations、hooks、内部签名和契约测试。
- 禁止普通资源 CRUD 直接修改账本集合。

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
- Hono 到 PocketBase 命令路由使用内部服务身份和请求签名。
- Admin 权限拆分为商品、教务、财务、结算、审计五类能力。
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

- 每个命令写 `operationId`、`traceId`、耗时和结果。
- 指标包括命令成功率、冲突重试、结算失败、余额不足、过期量、Outbox 积压和对账差异。
- 每日按学员与批次重建余额；发布初期增加逐小时增量对账。
- 差异进入 Admin 异常中心，只允许通过冲正/调整命令修复。

## 14. 迁移方案

### 14.1 准备

1. 固定 `release/2.0.0`，禁止继续增加 `students.hours` / `teachers.hours` 写逻辑。
2. 建立新集合、索引、hook 命令和只读查询。
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

- 关闭新命令路由和规则发布，不删除新数据。
- 已提交的新账本事件不反写旧 `hours`。
- 通过 feature flag 暂停冻结/结算，保留查询和导出用于人工处理。
- 修复后从最后成功操作继续，不直接重跑无幂等键脚本。

## 15. 验证策略

### 15.1 后端

- 领域单元测试：有效期、激活、FEFO、兑换图、出勤规则。
- PocketBase hook 集成测试：事务回滚、并发冻结、重复命令。
- 契约测试：Hono 与 hook 请求/响应、权限和错误码。
- 属性测试：任意操作序列后批次数量守恒且不为负。
- Hono 和 PocketBase hook 受影响代码的 lines、branches、functions、statements 分别不得低于 95%。
- 批次守恒、兑换、有效期、冻结、结算和冲正内核的关键分支必须完整覆盖。

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

- PocketBase 版本不支持目标 hook API -> 在实现第一阶段做版本探针，未通过则评估升级或 PostgreSQL。
- SQLite 单写者限制高峰结算 -> 保持短事务、按课堂拆分、队列化热点账户。
- 兑换环产生套利 -> 发布前图检测、参考价值上限、默认不可逆。
- 首次签到激活与取消产生歧义 -> 明确激活事件，候选课堂取消不激活。
- 历史 `hours` 无法识别课程 -> 只做人工映射迁移，不自动猜测。
- 规则配置过于复杂 -> Admin 提供预演、样例结果和发布检查清单。
- 事件和快照漂移 -> 定期重建对账和异常中心。

## 17. 实现前待确认

- 生产 PocketBase 精确版本与 JS hook 部署方式。
- 通用课程点计量单位和是否自身过期。
- `FIRST_CHECK_IN` 与 `FIRST_COMPLETED_SESSION` 的最终默认选择。
- 请假、迟到、缺席和机构取消规则矩阵。
- 支付渠道、监护人付款和订单撤销审批流程。
- 特定课程点允许的兑换方向与参考价值算法。
