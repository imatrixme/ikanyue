## Context

- 老板是 `isAdmin` 教师；工作台管理类接口用 `managing(e, administrator)` 每次请求重新读取教师记录。
- 经营数据都已在库里，不需要新字段：
  - 上课：`sessions.status="settled"` 的课节；扣掉的课时是 `session_credit_allocations.status="consumed"` 的 `quantity`；谁上的课看 `session_teachers` 中 `role=lead && actualStatus=confirmed` 的行；
  - 发课时：`credit_batches.originalQuantity`（不含冲正补偿批次 `compensationSourceBatchId`、不含已作废批次）；
  - 约课：`appointment_requests` 的 `requestedAt`（新申请）与 `cancelledAt`（取消）；
  - 新学员：`students.created`；
  - 续课：`renewals.go` 的 `loadRenewalCourses` / `renewalReason`（课时快用完 `low_balance`、快到期 `expiring`）；
  - 很久没来：`credit_batches.availableQuantity` 与 `session_students` 的上课记录。
- 预约与课表按北京时间（`bookingTimezone = Asia/Shanghai`）计算。

## Decisions

### 1. 时间段

- `period=today|week|month`，默认 `today`：
  - 今天：北京时间当天 00:00 到次日 00:00；
  - 本周：周一 00:00 到下周一 00:00；
  - 月：当月 1 日 00:00 到下月 1 日 00:00；默认本月，可带 `month=YYYY-MM` 查看更早的月份，晚于本月返回 400 `DASHBOARD_MONTH_INVALID`。
- 区间左闭右开，过滤时间统一走 `filterTime(...)`。
- 上课按课节 `startAt` 归入时间段（今天上的课算今天，不按确认时间）；其他数按各自发生时间。
- 返回 `range: {period, from, to, label, month, previous, next}`，`label` 如「10 月 30 日」「10 月 27 日 – 11 月 2 日」「2026 年 10 月」；月视图的 `month`、`previous`、`next` 是 `YYYY-MM`，已是本月时 `next` 为空，其他时间段三者为空。
- 非法 `period` 返回 400 `DASHBOARD_PERIOD_INVALID`。

### 2. 四个数

```
{
  lessons:  { count, credits },          // 已确认上课的节数、扣掉的课时
  grants:   { credits },                  // 发出的课时
  bookings: { requested, cancelled },     // 新约课申请、取消
  students: { joined }                    // 新学员
}
```

- 取消的课、待确认的课不计入「上课」。待确认的课在工作台已经有自己的列表，看板不重复。
- 撤销确认后课节不再是 `settled`，下次打开自然不计入，不需要额外处理。
- 不做实收金额：线下发课时的金额是老板手填的，不可靠。

### 3. 按老师对账

- 看板里每位在职老师一行：`{teacherId, name, lessons, credits}`，按节数从多到少；这段时间没课的老师也列出，显示 0。
- 在职老师只有一位时不返回（`teachers: []`），小程序不显示这块。
- 一节课算确认时的主讲；换过老师的课算代课老师的。
- 对账明细 `GET /v1/workbench/dashboard/teachers/{teacherId}?period=`：
  - `{range, teacher, count, credits, items: [{sessionId, title, startAt, endAt, students: [name], credits}]}`，按上课时间排序；
  - 最多 500 节，超过时 `truncated: true`，提示到网页后台查看。
- 不做课酬：只列节数与课时，不读课酬规则和课酬事件。

### 4. 关注名单

两张名单都不受时间段影响，各最多 20 人，点一行进入现有学员台账 `pages/workbenchStudent`。

- 需要续课 `renewals`：
  - 有课时批次的学员中，`renewalReason` 不为空的课程，每个学员取最急的一门；
  - 「快用完」在前，剩余课时少的在前；
  - 每行 `{studentId, name, courseName, remaining, reason, expiresAt}`。
- 很久没来 `inactive`：
  - 手上还有可用课时（未作废、未过期批次的 `availableQuantity > 0`）；
  - 没有还没开始的课（`session_students` 未取消、课节未取消、`startAt` 在现在之后）；
  - 最近一节课（已开始、未取消）在 21 天前；从没上过课的，从最早一批课时发放算起满 21 天；
  - 按没来的天数从多到少；每行 `{studentId, name, remaining, lastLessonAt, days}`，`lastLessonAt` 为空表示还没上过课。

### 5. 接口与权限

| 方法 | 路径 | 权限 |
|---|---|---|
| GET | `/v1/workbench/dashboard?period=&month=` | `isAdmin`，实时校验 |
| GET | `/v1/workbench/dashboard/teachers/{teacherId}?period=&month=` | `isAdmin`，实时校验 |

- 受雇老师 403 `COURSE_CREDIT_ADMIN_REQUIRED`。
- `mapi.json` 新增这两个接口（默认策略组）。

### 6. 小程序

- 工作台：老板（`sections.students`）看到「经营概览」入口，点进看板页。
- 看板页 `pages/workbenchDashboard`：
  - 顶部三个分段：今天 / 本周 / 按月；选按月时默认本月，显示「‹ 2026 年 10 月 ›」按月前后切换，本月不能再往后；
  - 四张数字卡；
  - 「按老师」列表（多老师时），点一行进入对账页 `pages/workbenchTeacherLessons`（带同一个时间段和月份）；
  - 「需要续课」「很久没来」两张名单，点一行进入学员台账；为空时各显示一句「暂时没有」。
- 对账页：顶部同样可切换时间段和月份，显示合计节数和课时，下面逐节列出。
- 下拉刷新；加载失败可重试。

**被否决的方案**：
- 预计算日报表：小工作室数据量小，按需查询足够快，预计算会多一张表和一个定时任务。
- 图表和趋势：老板想要的是「今天怎么样、谁要续、谁没来」，图表让页面变复杂，且会增加小程序包体积。
- 课酬统计：课酬规则由老板线下决定，系统只给节数和课时作对账依据。

## Risks / Trade-offs

- **查询量**：本月的课节、课时分配按月查询，关注名单按全部持有课时的学员查询；小工作室在可接受范围，变大后再考虑预计算。
- **21 天是固定值**：先不做设置，等老板反馈再调。
- **时区**：只支持北京时间，和预约一致。

## Migration Plan

- 不新增集合和字段，不迁移数据。
- 发布顺序：kanyue.server → 网关暴露清单上线 → 小程序。
