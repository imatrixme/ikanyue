## Context

- 老板是 `isAdmin` 教师；工作台管理类接口用 `managing(e, administrator)` 每次请求重新读取教师记录。
- 经营数据都已在库里，不需要新字段：
  - 上课：`sessions.status="settled"` 的课节；扣掉的课时是 `session_credit_allocations.status="consumed"` 的 `quantity`；每位老师上了哪节课看 `session_teachers` 中 `role=lead && actualStatus=confirmed` 的行；
  - 发课时：`credit_batches.originalQuantity`（不含冲正补偿批次 `compensationSourceBatchId`、不含已作废批次）；
  - 实收：`orders.status="granted"` 的 `paidAmount`（线下发课时由老板登记，线上订单是实付），只做记录；
  - 约课：`appointment_requests` 的 `requestedAt`（新申请）与 `cancelledAt`（取消）；
  - 新学员：`students.created`；
  - 续课：`renewals.go` 的 `loadRenewalCourses` / `renewalReason`（课时快用完 `low_balance`、快到期 `expiring`）。
- 预约与课表按北京时间（`bookingTimezone = Asia/Shanghai`）计算。

## Decisions

### 1. 时间段

- `period=today|week|month`，默认 `today`：
  - 今天：北京时间当天 00:00 到次日 00:00；
  - 本周：周一 00:00 到下周一 00:00；
  - 本月：当月 1 日 00:00 到下月 1 日 00:00。
- 区间左闭右开，过滤时间统一走 `filterTime(...)`。
- 上课按课节 `startAt` 归入时间段（今天上的课算今天，不按确认时间）；其他数按各自发生时间。
- 返回 `range: {period, from, to, label}`，`label` 如「10 月 30 日」「10 月 27 日 – 11 月 2 日」「10 月」。

### 2. 四个数

```
{
  lessons:  { count, credits },          // 已确认上课的节数、扣掉的课时
  grants:   { credits, paidAmount },      // 发出的课时、登记的实收（元）
  bookings: { requested, cancelled },     // 新约课申请、取消
  students: { joined }                    // 新学员
}
```

- 取消的课、待确认的课不计入「上课」。待确认的课在工作台已经有自己的列表，看板不重复。
- 撤销确认后课节不再是 `settled`，下次打开自然不计入，不需要额外处理。

### 3. 按老师

- 每位在职老师一行：`{teacherId, name, lessons, credits}`，按节数从多到少；这段时间没课的老师也列出，显示 0。
- 在职老师只有一位时不返回（`teachers: []`），小程序不显示这块。
- 一节课以确认时的主讲为准；换过老师的课算代课老师的。

### 4. 需要续课

- 有可用课时批次的学员中，`renewalReason` 不为空的，按「快用完」在前、剩余课时少在前排序，最多 20 个。
- 每行 `{studentId, name, courseName, remaining, reason, expiresAt}`，不受时间段影响。
- 点进去是现有学员台账 `pages/workbenchStudent`。

### 5. 接口与权限

| 方法 | 路径 | 权限 |
|---|---|---|
| GET | `/v1/workbench/dashboard?period=` | `isAdmin`，实时校验 |

- 受雇老师 403 `COURSE_CREDIT_ADMIN_REQUIRED`；非法 `period` 400 `DASHBOARD_PERIOD_INVALID`。
- `mapi.json` 新增该接口（默认策略组）。

### 6. 小程序

- 工作台：老板（`sections.students`）在顶部看到「经营概览」一行，显示今天上课节数，点进看板页。
- 看板页 `pages/workbenchDashboard`：
  - 顶部三个分段：今天 / 本周 / 本月；
  - 四张数字卡；实收金额旁注「线下登记，仅作记录」；
  - 「按老师」列表（多老师时），点一行进入现有的老师页面；
  - 「需要续课」列表，点一行进入学员台账；为空时显示「暂时没有需要续课的学员」。
- 下拉刷新；加载失败可重试。

**被否决的方案**：
- 预计算日报表：小工作室数据量小，按需查询足够快，预计算会多一张表和一个定时任务。
- 图表和趋势：老板想要的是「今天怎么样、谁要续课」，图表让页面变复杂，且小程序里图表组件会增加包体积。
- 老师课酬统计：结算规则还没对外，先不展示，避免和线下发工资的口径冲突。

## Risks / Trade-offs

- **实收金额只是登记**：线下发课时由老板手填，可能和真实收款不一致，页面明确标注。
- **查询量**：本月的课节和课时分配按月查询；小工作室一个月几百节课，在可接受范围。超过时再考虑分页或预计算。
- **时区**：只支持北京时间，和预约一致。

## Migration Plan

- 不新增集合和字段，不迁移数据。
- 发布顺序：kanyue.server → 网关暴露清单上线 → 小程序。
