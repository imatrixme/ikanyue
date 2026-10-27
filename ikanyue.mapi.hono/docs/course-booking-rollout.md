# 课程预约启用与调度

## 边界

- PocketBase 只保存集合、索引和 SDK Batch 事务数据，不运行 hook、cron 或业务脚本。
- Hono 持有预约资格、时间冲突、课时预留、取消、改期、过期与履约逻辑。
- `scripts/course-booking-worker.js` 是一次性执行器，由 1Panel 定时任务或其他外部调度器调用。
- 开发阶段不持续运行 Docker；PocketBase Docker 迁移、回滚、恢复和并发确认只在最终发布门禁执行。

## 数据启用顺序

1. 备份 PocketBase 数据，并在发布门禁验证备份可恢复。
2. 应用 `1784279400_course_booking.js` 与 `1784279410_course_booking_session_fields.js`。
3. 启动 Hono，确认 `/ops/course-bookings/reference-data`、策略、教师课程和开放时间接口可用。
4. 在 Admin 创建并启用预约策略，再为已审核教师配置一对一课程与对应课时类型。
5. 先运行历史未来课堂回填预检，处理 `booking_conflicts`；存在未解决冲突的教师课程保持停用。
6. 配置教师每周时间和日期例外，完成学员与教师小程序验收后再启用 offering。
7. 最后启用外部 worker 定时任务。

## Worker 账号

创建独立、已审核、未禁用的教师后台账号，并授予 `academic` capability。不要复用个人管理员账号。账号首次密码必须已经修改，避免被 `opsPasswordChangeGuard` 拦截。

环境变量：

```dotenv
COURSE_BOOKING_WORKER_BASE_URL=https://xapi.example.com
COURSE_BOOKING_WORKER_ACCOUNT=booking-worker
COURSE_BOOKING_WORKER_PASSWORD=replace-with-a-secret
COURSE_BOOKING_WORKER_INTERVAL_MINUTES=5
COURSE_BOOKING_WORKER_DELIVER_OUTBOX=false
COURSE_BOOKING_WORKER_OUTBOX_LIMIT=50
```

也可以短期提供 `COURSE_BOOKING_WORKER_TOKEN`，但生产环境应使用独立账号每次登录，避免长期静态令牌。

## 1Panel 调度

创建每 5 分钟执行一次的 Shell 计划任务：

```bash
cd /opt/kanyue/ikanyue.mapi.hono && \
KANYUE_ENV_FILE=/opt/kanyue/config/hono.env npm run course-bookings:workers
```

脚本会在同一时间桶内生成稳定的 `cutoffAt`、幂等键和 trace id，并调用：

- `POST /ops/course-bookings/workers/expire`
- `POST /ops/course-bookings/workers/fulfill`

同一时间桶重试不会重复产生状态迁移。两个任务并行尝试；任一失败时脚本返回非零退出码，并保留成功任务结果用于日志诊断。

## 通知前置条件

预约命令始终写入 `outbox_events`。只有 Hono 已注入可工作的通知 dispatcher，并且 worker 账号同时具备 `audit` capability 时，才设置：

```dotenv
COURSE_BOOKING_WORKER_DELIVER_OUTBOX=true
```

否则保持关闭。未配置 dispatcher 时强行开启会返回 `OUTBOX_DISPATCHER_REQUIRED`，但不会影响已经提交的预约事务；事件会保留在 Outbox 中等待后续投递。

## 监控与回滚

- 监控定时任务退出码、Hono 日志中的 trace id、`/ops/course-credits/metrics` 和 Outbox dead-letter 列表。
- 回滚入口是先停用所有预约 offering，再停止外部 worker；不要删除预约、事件、claims 或已物化课堂。
- 应用代码可回滚到不再暴露预约入口的版本，新增集合保持只读兼容。
- 只有完成备份恢复演练后，才允许在发布门禁执行迁移 down；禁止直接在线上删除预约集合。
