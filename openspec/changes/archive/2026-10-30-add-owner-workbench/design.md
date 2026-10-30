## Context

- 小程序登录后，一个微信身份可以对应「学员」和「教师」两种主体（`internal/identity/principal.go`）。教师会话里带着 `isAdmin` 和 `courseCreditCapabilities`，但没有后台作用域，所以进不了 `RequireOps` 保护的 `/ops/*`。
- 能力模型（`internal/coursecredit/coursecredit.go`）：
  - 教师按能力授权：`teacher`、`academic`、`finance`、`settlement`、`audit`；
  - `isAdmin` 教师拥有全部运营能力（`operatorCapabilities`）；
  - 添加学员要求 `isAdmin`（`internal/students`）。
- 现有后台命令，本期全部复用：
  - 添加学员：`POST /ops/students`；
  - 线下报课：`enroll`，含 `paidAmount`、`channel: offline`，要求 `finance`；
  - 学员台账：`/ops/course-credits/accounts/{studentId}`；
  - 出勤：`setAttendance` / `markAllPresent`，`actorTeachingScope: assigned` 限定只能操作自己任课的课；
  - 结束课节：`updateLesson` 转为 `completed`，开课后才能结束；
  - 结算：`settleSession`，要求 `settlement`；
  - 撤销结算：`reverseSessionSettlement`，要求 `settlement`。
- 小程序走 `mapi`，`mapi` 只暴露清单里的小程序接口，不暴露 `/ops/*`。

## Goals / Non-Goals

**Goals**
- 一个教师工作台：老师和老板是同一个页面，内容按权限显示。
- 老板在小程序里完成「添加学员 → 发课时 → 学员约课 → 老师确认上课（核销）→ 必要时撤销」的闭环。
- 一人工作室没有任何多余步骤。

**Non-Goals**
- 不做新租户自助注册、学员扫码加入、权限下放界面、在小程序里编辑课包和价格、线上支付。

## Decisions

### 1. 权限即界面，不新增身份

- 工作台的每个模块对应一个权限：
  - 「今天的课 / 待核销」：`teacher`；
  - 「学员」「添加学员」：`isAdmin`；
  - 「发课时」：`finance`；
  - 「撤销核销」：`settlement`。
- 老板就是 `isAdmin` 教师，四项全有。受雇老师通常只有 `teacher`，只看到教学模块。
- 小程序只读会话返回的权限来决定显示什么。真正的授权在后端，每个接口单独校验。

**被否决的方案**：
- 新增「老板」身份：登录要多选一次身份，tab 和页面要维护两套；
- 老板/老师两种模式手动切换：一人工作室每天都要来回切。

### 2. 管理类权限按请求实时校验

- 会话里的权限是登录时的快照，有效期内撤销权限不会立刻生效。
- `/v1/workbench/*` 里的管理类接口（添加学员、发课时、学员台账、撤销核销）每次请求都按会话里的教师 id 重新读取教师记录。只要满足下列任一条件，就返回 403：
  - 教师已停用；
  - 教师不再是 `isAdmin`；
  - 教师不再拥有对应能力。
- 教学类接口（待核销、确认上课）沿用现有做法，看会话里的 `teacher` 能力，同时用 `assigned` 范围限定只能操作自己任课的课。老板也走 `assigned`，除非拥有 `academic`；拥有 `academic` 时范围是全店，与后台一致。

### 3. 「确认上课」是一个组合命令

- 新命令 `confirmLesson`，在一个事务里依次执行：
  1. 记录出勤：默认全部到课，可以带缺席名单；
  2. 结束课节：开课前提交返回 `LESSON_NOT_STARTED`；
  3. 结算：按出勤扣减课时。
- 执行者可以是这节课的任课老师，也可以是拥有 `academic` 的老板。结算这一步不要求执行者有 `settlement` 能力，这正是本期「核销属于教学」的决定。审计里记下执行者和组合命令名。
- 幂等：沿用 `prepareTeaching` 的幂等键，同一个幂等键重放返回原结果。已经结算过的课返回 `SESSION_ALREADY_SETTLED`，不会重复扣课时。
- 撤销核销沿用 `reverseSessionSettlement`，要求 `settlement` 并必须写原因。课节进入 `correction_pending`，之后可以重新确认。

**被否决的方案**：让老师只记出勤，老板再去点「结算」。这对一人工作室来说是同一个人做两遍，对受雇老师来说核销要等老板，不符合已确认的决定。

### 4. 发课时只用已有课包

- 发课时 = 线下报课（`enroll`）：
  - 选学员、课包、价格版本；
  - 可填 `paidAmount` 作为实收金额；
  - `channel` 固定为 `offline`。
- 实收金额低于标价就是「自定义优惠」，订单上同时保存标价和实收。只做记录，不对账，不经过支付插件。
- 课包和价格仍在网页后台维护。小程序里没有可选课包时，提示「请先在后台创建课包」。

### 5. 单人默认

- 新增查询 `GET /v1/workbench/summary`，返回：
  - 当前教师的权限摘要；
  - 本工作室在职教师数 `teacherCount`；
  - 待核销课数和待确认预约数（工作台角标用）。
- `teacherCount == 1` 时，工作台不显示老师名、老师筛选和「选择老师」控件；多于一位时才显示。
- 本期命令都不需要老师参数：确认上课的老师来自课节，发课时与老师无关。以后需要指定老师的命令，也按「能推断就不问」处理。

### 6. 接口与暴露

| 方法 | 路径 | 权限 | 复用 |
|---|---|---|---|
| GET | `/v1/workbench/summary` | 教师 | 新查询 |
| GET | `/v1/workbench/lessons/pending` | `teacher`（assigned） | 课表查询，筛选已开课、未结算的课 |
| POST | `/v1/workbench/lessons/{sessionId}/confirm` | 任课老师或 `academic` | `confirmLesson` |
| POST | `/v1/workbench/lessons/{sessionId}/reverse` | `settlement`，实时校验 | `reverseSessionSettlement` |
| GET | `/v1/workbench/students` | `isAdmin`，实时校验 | 学员列表 |
| POST | `/v1/workbench/students` | `isAdmin`，实时校验 | 学员创建 |
| GET | `/v1/workbench/students/{id}/ledger` | `isAdmin`，实时校验 | 学员台账 |
| GET | `/v1/workbench/packages` | `finance`，实时校验 | 可售课包与当前价格版本 |
| POST | `/v1/workbench/students/{id}/grants` | `finance`，实时校验 | `enroll` |

- 全部挂在租户作用域之下（`tenancy.Scope`）。
- `mapi.json` 新增一批，放在默认策略组，并与小程序的 `services/apis.js` 一致，由暴露清单测试保证。
- 响应只用课程、课时、学员这些业务语言，不暴露台账内部字段，遵守现有的「Student-Safe and Teacher-Safe Presentation」要求。

## Risks / Trade-offs

- **核销不再需要 `settlement` 能力**：受雇老师可以扣自己课上学员的课时。缓解措施：
  - 只能扣自己任课的课；
  - 每次都写审计；
  - 老板可以撤销；
  - 这是已确认的产品决定。
- **小程序会话权限过期**：管理类接口实时校验，教学类接口沿用快照，所以被停用的老师在会话过期前仍能核销自己的课。是否需要即时失效留待后续。
- **课包只能在后台维护**：一人工作室第一次使用仍需要网页后台。后续提案再做小程序内的课包编辑。

## Migration Plan

- 不新增集合，不迁移数据。
- 发布顺序：kanyue.server → 网关暴露清单上线 → 小程序。小程序在接口还没有上线时，`summary` 返回 404，工作台只显示原有模块。
