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
| 报课与账本 | `/ops/course-operations/enrollments*`；`/ops/course-credits/{orders*,enrollments*,accounts*,student-overview,batches/*,workers/expiry/run,reconciliation/*,settlement-exceptions*,audit-logs*}`；`/v1/student/learning/*` | 后台、小程序 | Go |
| 约课 | `/v1/student/{booking-options,booking-slots,appointments*}`；`/v1/teacher/{appointments*,offerings/*,availability-overrides/*,booking/dashboard}`；`/ops/course-bookings/*`（除 backfill） | 小程序、后台 | Go |
| 课表与结算 | `/ops/course-credits/{classes*,sessions*,class-*,session-*,assigned-*}`；`/ops/course-operations/{classes,lessons}*`；`/ops/course-calendar`；`/v1/teacher/{calendar,schedule}`；`/v1/schedule/upcoming` | 后台、小程序 | Go |
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
- 已修正：`students`、`teachers`、`activities` 的 `created` 字段开着 onUpdate（来自 Hono 本地建表脚本），每次登录都会覆盖注册时间。迁移 `kanyue_0002_freeze_created` 关掉它，建表脚本同步改正；已被覆盖的时间无法恢复。

## 阶段 2 记录（2026-10-27，America/Los_Angeles）

Go 接管学员目录（`/ops/students` 列表/新建/修改）、续费跟进（`/ops/course-credits/students/{id}/follow-ups`）、课程目录查询（课程、课点类型、课包、课时、价格的 list/get），以及 `/ops/course-operations` 下课程、课包、课时、价格的新建/修改/状态。模块名 `students`、`course-catalog`。`coursecredit` 包承载课程点路由共用的请求处理（errorCode/details/traceId 错误信封、能力校验、拒绝审计、`X-Trace-Id`），资源查询和后台写入按配置表扩展，后续阶段往表里加资源即可。

验证：契约测试对 Hono 和 Go 都是 14/14（另 2 个需要真实账号密码的阶段 1 用例跳过），读接口逐字节一致；在业务数据副本上起一对隔离的 Go + Hono，用同样的写命令各跑一遍，响应、错误码与落库行一致（含唯一冲突时 PocketBase 批量接口的 `Batch transaction failed.`）。

照搬的 Hono 现状与差异：
- 课点类型没有写接口；课时没有状态接口；价格是版本化资源，修改和改状态都会新建下一版本，旧版本不动。
- 课程点命令的执行计数在 Hono 进程内存里（`/ops/course-credits/metrics` 仍走 Hono），Go 执行的命令不计入，直到 metrics 迁移。
- 未预期错误：Hono 会把原始错误信息回给客户端，Go 统一回“服务器内部错误”并记日志。

## 阶段 3 记录（2026-10-27，America/Los_Angeles）

Go 接管报课与账本，模块名 `ledger`：订单发放课程点（受 `COURSE_CREDIT_GRANTS_ENABLED` 控制，默认值与 Hono 相同，非 production 开、production 关）、后台报课与班级未来课堂同步（预览、确认）、批次延期与过期补偿、手动过期、对账，账本查询（订单、报课、账户、学员概览、结算异常、对账结果、审计日志），以及小程序 `/v1/student/learning/*` 五个学习视图。写入沿用 Hono 的批量计划语义：版本占位做乐观并发，`credit_operations.idempotencyKey` 做幂等重放，同一事务内落库；重放、冲突、版本冲突重试一次、错误码都照 Hono。测试用的账本集合结构从本地库导出（`internal/testkit/ledger_collections.json`），保证测试与真实表结构一致。

定时任务（D5）：模块被 Go 接管时注册两个 PocketBase cron，只在 `serve` 时运行；交还 Hono 时不注册，避免两边重复执行。
- 课时过期每 5 分钟一次，每次最多 100 个批次，操作人 `course-credit-expiry-worker`（system）。每个批次的幂等键带批次版本，重跑或与手动触发并发都不会重复过期。
- 增量对账每天 03:00（Asia/Shanghai，cron 按 UTC 写作 `0 19 * * *`），窗口 25 小时；有差异时记 warn 日志，差异明细照常写入 `reconciliation_exceptions`。Hono 没有定时对账，这是新增行为。

验证：契约测试对 Hono 与 Go 均通过（新增 `contract/ledger.test.mjs`，含账本读接口逐字节一致）；临时停掉 Hono 时 Go 仍能响应账本路由，未迁移路由返回 502，证明请求确由 Go 处理。在两份业务数据副本上分别起 Go（接管账本）与 Hono，用同样的幂等键和 trace 依次执行发放、重放、报课（含班级）、重放与冲突、同步预览与确认、手动过期、过期补偿、延期、全量对账以及账本和学习视图读取：28 个响应在替换生成的编号、时间和哈希后一致，15 张相关表的落库行一致，账本对账结果为 passed。

照搬的 Hono 现状与差异：
- 列表查询直接在进程内按过滤条件取全量，不再受 PocketBase REST 的过滤长度与表达式数量上限约束，比 Hono 宽松。
- 课程名排序用 `golang.org/x/text/collate` 的根排序规则代替 `localeCompare`，常见中英文课程名的顺序一致；极端字符的细微排序可能不同。
- 学习视图按 Hono 的字段顺序输出，内部字段与内部术语的拦截顺序和报错路径一致。
- outbox 事件照常写入，投递仍由 Hono 的 outbox worker 负责；命令执行计数仍只在 Hono 进程内（同阶段 2）。

## 阶段 4 记录（2026-10-27，America/Los_Angeles）

Go 接管约课，模块名 `booking`：学员可约课程与时段、预约申请/撤回/取消（含取消预览与现金退款路径）、教师工作台（看板、预约列表、确认/拒绝/取消/改期、每周可约时间与临时开放/关闭），以及 `/ops/course-bookings/*` 下的看板、参考数据、预约查询与代约（可一步确认，确认不成立时自动撤回）、策略版本、课程预约配置、可约时间、冲突处理和过期/兑现两个 worker。确认与代约确认受 `COURSE_CREDIT_RESERVATION_ENABLED` 控制，默认值与 Hono 相同（非 production 开、production 关），compose 默认关。排课回填（`/ops/course-bookings/backfill*`）留在 Hono；教师日历、课表与课堂取消归阶段 5，暂由 Hono 提供。测试用的约课、排课占位与收款集合结构从本地库导出（`internal/testkit/booking_collections.json`）。

定时任务：模块由 Go 接管时注册两个 cron，操作人 `system`。待确认预约过期每 5 分钟检查一次，已完成或已结算课堂对应的预约兑现每 15 分钟检查一次；没有到期对象时跳过，不写空操作。手动触发的 worker 路由保留。Hono 没有这两个定时任务，这是新增行为。

验证：Go 测试覆盖申请→确认→改期→取消、拒绝/撤回/过期/兑现、代约与功能开关、可约时间与策略/配置/冲突、cron 过期。契约测试新增 `contract/booking.test.mjs`，对 Hono 与 Go 均通过，含后台约课读接口和学员可约时段的逐字节一致。在两份业务数据副本上分别起 Go（接管约课）与 Hono，用同样的幂等键与 trace 执行 66 个请求（申请、重放、确认、改期、取消、现金退款取消、代约与机构取消、拒绝、撤回、worker、可约时间、临时时间、策略、配置、冲突及各类拒绝路径）：替换生成的编号、时间和哈希后响应全部一致，21 张相关表的落库行一致。

照搬的 Hono 现状与差异：
- 展开的关联记录（教师、学员等）按超级用户视图输出，与 Hono 经 PocketBase REST 读到的一致（含 `email`）；这同时修正了阶段 3 账本查询中展开记录少字段的差异。冲突列表等原样输出记录的接口因此会带出关联账号的邮箱等字段，后台改造时再收窄。
- `cutoffAt` 无效时照 Hono 返回 500 `Invalid time value`。
- outbox 投递与命令执行计数同阶段 3。

## 阶段 5 记录（2026-10-27，America/Los_Angeles）

Go 接管课表与结算，模块名 `sessions`。覆盖范围：
- 班级与课堂的增改和状态，包括 `/ops/course-operations/{classes,lessons}*` 与 `/ops/course-credits/` 下的列表和详情。
- 学员入班、转班与教师任课。
- 课堂发布、改期和取消：排课占位、预留课程点的保留/释放/补扣，取消时按结算规则释放。
- 出勤与一键全到、教师实到确认、结算预览、结算与撤销结算。
- 机构日历、教师后台日历、教师端日历与课表、首页近期课程，以及后台“我的学员/班级/课堂”。

结算与撤销结算受 `COURSE_CREDIT_SETTLEMENT_ENABLED` 控制，默认值与 Hono 相同（非 production 开、production 关），compose 默认关。本阶段没有新增定时任务。`/v1/course-credits/*`（学员课堂列表与自助预留）、`teacher-events` 和排课回填仍留在 Hono。测试用的 `class_teachers` 集合结构从本地库导出。

验证：
- Go 测试覆盖两条完整链路：
  - 建班→入班→任课→建课→发布→改期→冲突→取消。
  - 约课课堂的出勤→实到→完成→预览→结算→重放→撤销→更正出勤→重新结算，含功能开关、权限与各类拒绝路径。
- 新增契约测试 `contract/sessions.test.mjs`，对 Hono 与 Go 均通过，含后台课表读接口和结算预览的一致性比对。
- 对账方法同阶段 4：两份数据副本，一份由 Go 接管全部模块，另一份把 `sessions` 交还 Hono，同样的幂等键与 trace 执行 126 个请求。
  - 写操作包括建班、入班、转班与重放、任课、建课、发布与重放、教师替换、冲突、改期、出勤、实到、取消、约课课堂的完整结算与撤销链路。
  - 每轮写操作后再读一遍全部日历、课表和列表。
  - 替换生成的编号、时间和哈希后，响应全部一致，18 张相关表的落库行一致。
  - 同一课堂内多个班级、学员的排列顺序依赖随机 id，两侧本来就不固定，比较时按内容排序后再比。

照搬的 Hono 现状与差异：
- 后台“我的学员”（`/ops/course-credits/assigned-students`）在 Hono 中按不存在的 `realname`/`nickname` 字段排序和搜索，PocketBase 返回 400，所以这个接口一直不可用（后台与课堂工作台都在调用）。Go 改用 `realName`/`nickName`，接口恢复正常；这是唯一有意的行为差异，Hono 侧不再修，阶段 8 一并删除。
- 日历筛选项按 `zh-CN` 排序，Go 用 `x/text/collate` 对应 `localeCompare`。
- outbox 投递与命令执行计数同阶段 3。
