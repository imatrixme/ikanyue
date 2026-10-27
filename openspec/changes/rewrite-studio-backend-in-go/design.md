## Context

- 业务数据在 PocketBase v0.32.0（SQLite）。Hono 通过 JS SDK 以超级用户身份访问它，多集合写入依赖 Batch API。
- 支付网关 `kanyue.pay` 有独立的 PocketBase 和凭据，通过 `PAY_GATEWAY_URL` 与业务侧交互，并向业务侧 `POST /internal/commerce/payment-events` 回调（`Authorization: Bearer PAY_EVENT_TOKEN`）。
- 客户端：
  - 小程序访问 `/v1/*`；
  - 后台经同源 `/ops/*` 访问；
  - 官网访问 `/v1/public/course-catalog*`。
- 接口约定：
  - 响应包为 `{code, message, data}`，成功时 `code=10000`，错误也返回 HTTP 200。
  - JWT 为 HS256，claims 是 `{id, sn, role, isAdmin, ...}`。
  - 小程序令牌有效期 30 天；后台令牌带 `scope: "ops"`，有效期 12 小时。
  - 带 `challengeType` 的身份选择凭证不能当登录令牌用。

## Decisions

### D1. PocketBase 作为库嵌入，业务在 Go 进程内执行（推翻原 §5.1 决策）

原决策禁止 PocketBase hook 与事务，理由是“不把 API 层业务规则下沉到存储层”。嵌入方式下业务代码仍是独立的 Go 包（`internal/<module>`），PocketBase 只提供存储、事务、路由和调度，这一顾虑不再成立。原来为了没有事务而存在的东西都可以删掉：
- Batch API 模拟原子写入；
- 启动时的批量上限检查；
- 补偿逻辑。

仍然禁止：
- 在 PocketBase 记录钩子（`OnRecord*`）里写业务规则。业务规则只在 service 里，便于测试和追踪。
- 在 PocketBase 集合 API 规则里放开客户端访问。所有集合保持仅超级用户可访问。

### D2. 绞杀榕：Go 在前，其余转发 Hono

```text
小程序 / 后台 / 官网 / 支付网关
            │
      kanyue.server（Go，内嵌 PocketBase 与 pb_data）
       ├── 已迁移模块 → Go service（事务）
       ├── /api/*、/_/ → 仅内部访问（过渡期给 Hono 用）
       └── 其余 /v1、/ops、/internal → 反向代理到 Hono
                                   Hono 的 PB_URL → kanyue.server 内部地址
```

- 两边写同一个 SQLite。所有写入都经过同一个 PocketBase 进程，不存在双库或同步问题。
- 模块的归属在代码里显式登记；可以用 `KANYUE_HONO_MODULES` 把指定模块退回 Hono，作为回退开关。
- 过渡期内不做不兼容的表结构变更，保证随时可以回退。

### D3. 契约优先

- 新增黑盒 HTTP 契约测试（`kanyue.server/contract`，Node test runner，用 `BASE_URL` 指定被测服务），先在 Hono 上跑通，再拿去验证 Go。
- 只读接口用同一份数据对比两边响应；写接口在各自的数据副本上执行，比较返回结果和写后状态。
- 鉴权、脱敏、错误码都要有用例。

### D4. 表结构与迁移

- Go 版本化迁移（`migrations/`）对已有数据库幂等：集合存在就跳过或补字段，不重建，不删字段。
- 迁移通过 `kanyue-server migrate up` 显式执行；启动时不自动迁移；有未执行的 Go 迁移时拒绝启动并列出迁移名。
- 全部模块迁完后，删除 `ikanyue.mapi.hono/pocketbase/pb_migrations` 和 `ops:schema:apply` 这两处来源。

### D5. 进程内定时任务

以下任务改用 PocketBase 内置 cron 在进程内运行，原有的 `/ops/*/workers/*` 接口在过渡期保留，供手动触发：
- 预约过期与兑现；
- 课时过期；
- outbox 投递；
- 收款恢复。

每个任务幂等、可重入，单次处理有上限。

### D6. PocketBase 原生接口只对内

- 中间件对 `/api/*` 和 `/_/` 的请求，只放行来自回环或内网、且没有经过公网反代（没有 `X-Forwarded-For` 或 `X-Real-IP`）的请求，其余返回 404。
- 例外：`GET`/`HEAD /api/files/*` 对外开放，因为已存的头像、奖品图片 URL 指向 `data.ikanyue.com/api/files/...`；集合自身的文件访问规则仍然生效。
- 线上 OpenResty 只转发 `/v1`、`/ops`、`/internal` 和后台页面路径。

### D7. 后台：Svelte 单页，打包进 Go

- 和 PocketBase 控制台一样：Svelte + Vite，hash 路由，不用组件库。
- 样式只用 `design-system/brand-tokens.json` 生成的 token（新增 `ui` 生成目标）。
- `go:embed` 打包构建产物，由 Go 在后台域名的根路径托管，`/ops` 同源访问。
- 页面按模块迁移进度逐步上线。范围外页面在过渡期由旧 React 后台提供，两者都使用 `/ops` 令牌，复用同一套登录。

## 接口归属清单

| 模块 | 路由（前缀） | 调用方 | 归属 |
|---|---|---|---|
| 身份 | `/v1/user/*`；`/ops/auth/*` | 小程序、后台 | Go |
| 场馆 | `/v1/public/venues`；`/ops/venues*` | 小程序、后台 | Go |
| 学员 | `/ops/students*`；`/ops/course-credits/students/:id/follow-ups` | 后台 | Go |
| 课程与课时包 | `/ops/course-credits/{catalog,packages,price-versions,package-grant-lines,…}`；`/v1/public/course-catalog*` | 后台、官网 | Go |
| 报课与账本 | `/ops/course-operations/enrollments*`；`/ops/course-credits/{orders/:id/grant,accounts,batches/*,reconciliation/*,settlement-exceptions,audit-logs}`；`/v1/student/learning/*` | 后台、小程序 | Go |
| 约课 | `/v1/student/{booking-options,booking-slots,appointments*}`；`/v1/teacher/{appointments*,offerings/*,availability-overrides/*,booking/dashboard}`；`/ops/course-bookings/*`（除 backfill） | 小程序、后台 | Go |
| 课表与结算 | `/ops/course-credits/{classes*,sessions*,class-*,session-*}`；`/ops/course-operations/lessons/*`；`/ops/course-calendar`；`/v1/teacher/{calendar,schedule}`；`/v1/schedule/upcoming` | 后台、小程序 | Go |
| 线上收款 | `/v1/student/commerce/*`；`/ops/commerce/*`；`/internal/commerce/payment-events` | 小程序、后台、支付网关 | Go |
| 范围外 | `/v1/activity/*`、`/v1/points/*`、`/v1/reward-items`、`/ops/points/*`、`/ops/reward-items*`、`/ops/course-credits/{migration,shadow,teacher-events,conversion-rules,metrics,outbox}/*`、`/ops/course-bookings/backfill*`、`/v1/course-credits/*`、素材与其他无调用方接口 | — | 继续由 Hono 提供 |

具体端点以契约测试清单为准；迁移某个模块时，先把它的端点逐条列进契约测试。

## 阶段与发布

| 阶段 | 内容 | 上线条件 |
|---|---|---|
| 0 小样 | 验证 D1、D2、D6 与 JWT 互通 | 小样检查全部通过 |
| 1 底座 | 服务骨架、契约测试框架、本地栈与 compose 接入、场馆、公开课程目录、身份 | 契约测试在 Hono 和 Go 上都通过；旁路验证 |
| 2 | 学员、课程与课时包 | 同上 |
| 3 | 报课与账本（含定时过期、对账） | 同上，另加账本余额对账与 Hono 结果一致 |
| 4 | 约课（含定时过期与兑现） | 同上 |
| 5 | 课表与出勤结算 | 同上，另加结算与冲正对账 |
| 6 | 线上收款与支付回调 | 同上，另加模拟支付全流程冒烟 |
| 7 | 后台切换 | Svelte 后台覆盖全部范围内页面；旧后台只保留范围外页面 |

每个阶段上线前：备份 `pb_data` → `migrate up` → 旁路验证 → 切换路由归属。回退：用 `KANYUE_HONO_MODULES` 把模块退回 Hono。

## Risks

- **课时、金额一致性**：先迁读接口，再迁写接口；写接口上线前，要在同一份数据副本上分别跑 Hono 和 Go，比较账本结果。
- **两套实现并存太久**：每个阶段都要能独立上线，不攒大版本。
- **PocketBase 升级**：锁定 v0.32.0，和线上数据库一致；升级另起变更。
- **原生接口暴露**：由 D6 和契约测试覆盖。
- **SQLite 写入并发**：所有写入都经过同一进程。批量任务需要分批，避免长事务阻塞请求。

## Spike 结果（2026-10-27，America/Los_Angeles）

小样代码在 `kanyue.server`。在本地业务库 `data.db` 的副本上运行 Go 服务，Hono 的 `PB_URL` 指向 Go 服务，结果如下：

| 检查 | 结果 |
|---|---|
| 0.1 直接打开现有 `pb_data` | 通过。Hono 的启动存储检查经 Go 内嵌的 PocketBase 通过。运行前后表结构指纹一致，`_migrations` 仍为 72 条 |
| 0.2 `GET /v1/public/venues` | 通过。Go 与 Hono 对同一数据的响应完全相同 |
| 0.3 JWT 互通 | 通过。Go 接受 jsonwebtoken 签发的学员令牌和后台令牌，拒绝身份选择凭证、过期令牌和其他密钥签的令牌；Hono 接受 Go 签发的学员令牌 |
| 0.4 转发与回退 | 通过。GET 带 query、POST 带 body 的响应与直连 Hono 一致；设置 `KANYUE_HONO_MODULES=venues` 后场馆接口交回 Hono |
| 0.5 原生接口只对内 | 通过。内部请求 `/api/health` 返回 200；带 `X-Forwarded-For` 或 `X-Real-IP` 的 `/api/*` 和 `/_/` 返回 404，且不泄露数据 |
| 0.6 事务回滚 | 通过。两个集合的写入在失败时全部回滚，成功时全部提交 |

小样中发现、后续必须遵守的事项：
- **请求体会被读两遍**：PocketBase 把请求体包成读到结尾会自动重读的 reader，直接交给 `httputil.ReverseProxy` 会让 body 重复（`ContentLength=16 with Body length 32`）。转发时要按 `Content-Length` 截断，已有单元测试覆盖。
- **`serve` 会自动执行 `core.AppMigrations`**：业务迁移不能注册到这里，要放在自己的列表里，由显式的 `migrate up` 命令执行，才符合 D4。
- **不能执行 `migrate history-sync`**：它会删掉 `_migrations` 里现有的 JS 迁移记录。其他情况下 PocketBase 会忽略这些记录。
- **PocketBase 的 Logger 写进 `auxiliary.db`，不打到标准输出**：启动和运维信息（例如模块交回 Hono）要打到标准输出。本地 `auxiliary.db` 已有 553 MB，但保留天数已是默认的 5 天，清理任务只在服务运行时执行，所以不需要改设置（阶段 1 核实）。
- **系统迁移靠 `github.com/pocketbase/pocketbase/migrations` 包的 `init()` 注册**：`pocketbase.New()` 会间接导入它；用 `core.NewBaseApp` 写测试时要手动导入。
- 可执行文件约 33 MB（darwin/arm64，含 PocketBase 和 SQLite）。

结论：D1、D2、D6 和 JWT 兼容这几个前提都成立，可以进入阶段 1。

## 阶段 1 记录（2026-10-27，America/Los_Angeles）

Go 接管场馆、公开课程目录、身份（小程序密码/微信登录、身份选择、刷新、资料更新、后台登录/注册/me/改密）。`/v1/user/avatar` 仍走 Hono（没有调用方，且 Hono 实现本身不可用）。本地 native stack 上，契约测试分别对 Hono 和 Go 跑都是 11/11，读接口与 Hono 逐字节一致；身份接口全量比对只剩易变字段和本地环境差异（Hono 会读 `ikanyue.mapi.hono/.env` 里的 `DEFAULT_AVATAR`）。

为保持行为一致而照搬的 Hono 现状（后续阶段再决定是否修正）：
- 教师账号只能用 email 作身份字段做密码校验（`teachers.passwordAuth.identityFields = ["email"]`），没有 email 的教师无法用密码登录。
- 匿名或无角色的审计（登录失败、注册关闭）写入会因 `actorRole` 只允许 teacher/admin 而失败，只打日志。
- 后台注册不传 email，而 `teachers.email` 必填，开启注册后创建会失败（默认关闭）。Go 版顺带把姓名写进 `realName`（Hono 写的是不存在的 `realname`）。
- `students`、`teachers` 的 `created` 字段开着 onUpdate，每次登录都会覆盖注册时间；修正需要一次表结构迁移，等确认后再做。
