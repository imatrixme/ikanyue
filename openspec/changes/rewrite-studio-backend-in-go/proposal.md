## Why

现在跑起一个工作室约课系统，要同时维护业务 PocketBase、Hono API、恢复 worker、nginx 托管的 React 后台，外加独立的支付网关和支付库。业务和数据不在同一进程里，Hono 只能通过 HTTP 调 PocketBase，拿不到数据库事务。为此不得不用 Batch API 模拟原子写入、启动时检查批量上限、写 outbox 与补偿逻辑。表结构也有三处来源：`pb_migrations`、`ops:schema:apply` 和启动检查。

PocketBase 本身就是 Go 写的，可以作为库嵌进业务程序。用 Go 重写业务后端，就能在同一进程里使用真正的 SQLite 事务，把数据库、业务接口、定时任务和后台页面合成一个可执行文件，同时直接沿用现有 `pb_data`，不需要迁移数据。

本期只迁移[工作室约课体验版](../../../docs/strategy/certified-teacher-platform/studio-booking-mvp.md)（参照松果约课）范围内的逻辑，支付网关 `kanyue.pay` 保持独立。

## What Changes

### 新的 Go 服务 `kanyue.server`
- 把 PocketBase v0.32.0 作为库嵌入，直接打开现有业务 `pb_data`。替代独立的业务 PocketBase 进程，最终也替代 Hono。
- 写操作在 `RunInTransaction` 中完成。课时账本、预约、结算的多集合写入在一个事务里提交或回滚。
- 保持现有接口契约不变：
  - 路径、`{code: 10000, message, data}` 响应包、错误同样返回 HTTP 200。
  - JWT（HS256，同一个 `JWT_SECRET`，相同 claims 与有效期）。
  - 小程序、官网、支付网关都不用改，已登录用户也不用重新登录。
- **按模块逐步接管（绞杀榕）**：Go 服务放在最前面，已迁移的路由由 Go 处理，其余原样转发给 Hono。每个模块可以单独切换、单独回退。
- PocketBase 自带的 `/api/*` 和控制台 `/_/` 只对内开放（过渡期供 Hono 访问），公网请求一律拒绝。
- 表结构由 Go 版本化迁移统一管理，通过显式命令执行，启动时不自动迁移。
- 定时任务（预约过期与兑现、课时过期、outbox、收款恢复）改为进程内调度，取代外部调度器调用 worker 接口。

### 本期迁移范围（只迁有调用方的接口）
1. 身份：微信登录、角色选择、刷新、资料，后台登录与改密。
2. 场馆：公开列表、后台管理。
3. 学员档案与跟进。
4. 课程与课时包：课程规格、课时类型、课时包、价格版本、公开课程目录（官网）。
5. 报课与课时账本：报课、发放、账户、批次延期与恢复、过期、对账异常、学员课时与上课记录。
6. 约课：预约策略、开放课程、可约时间与例外、学员、老师与后台预约（含确认、拒绝、取消、改期）、冲突处理。
7. 课表与出勤结算：班级、课堂、发布、取消、改期、出勤、结算、冲正、课表日历、老师课表。
8. 线上报课收款：商品、下单、收银台、退款、恢复、对账，以及支付网关事件回调。支付网关本身不改。
9. 操作审计。

迁移清单以“小程序、后台、官网、支付网关、调度器实际调用”的接口为准，详见 `design.md`。

### 新后台 `kanyue.server/ui`
- 参照 PocketBase 控制台：Svelte + Vite 单页应用，不用组件库，样式只用设计 token，构建产物打包进 Go 可执行文件，和 `/ops` 接口同源。
- 只覆盖本期范围内的页面，沿用已收敛的五组导航：今天、学员、约课、收款、设置，外加“更多”。
- 范围外页面（积分、历史迁移、教师工作量）在过渡期继续由旧 React 后台提供。

### 不在本期范围（继续由 Hono 提供，是否保留另行决定）
活动与报名、积分与实物兑换、音视频素材、课程点转换、历史数据迁移与回填、教师工作量与收入、没有调用方的旧接口。

## Non-goals

- 不改支付网关 `kanyue.pay` 及其数据库。
- 不改数据模型的业务含义，不做数据迁移；过渡期 Hono 与 Go 必须能读写同一份数据。
- 不改小程序和官网；它们的接口地址和契约保持不变。
- 不做多租户、SaaS 授权。
- 不在本期删除 Hono；范围外模块的去留单独决定。

## Impact

- Affected specs：新增 `studio-server-runtime`、`studio-admin-console`。
- Affected code：
  - 新增 `kanyue.server`（Go 服务与 `ui/` 后台）。
  - `ikanyue.mapi.hono`：过渡期只改 `PB_URL` 指向；模块迁完后对应代码删除。
  - `ikanyue.admin`：范围内页面迁完后只保留范围外页面。
  - `compose.yaml`、`scripts/native-stack.mjs`：用 Go 服务替代业务 PocketBase 进程，并转发 Hono。
- Architecture：
  - 推翻 `docs/architecture/course-credit-system-technical-design.md` §5.1 的“PocketBase 不承载业务、禁止事务与 hook”决策，见 `design.md`。
  - `GEB.MD` §8 中“客户端只通过 Hono API 访问”在落地时改为“只通过业务 API（`kanyue.server`）访问”。
- Dependencies：
  - 生产依赖 `github.com/pocketbase/pocketbase` v0.32.0（与线上数据库版本一致）；JWT 使用它已带的 `golang-jwt/jwt/v5`。
  - 后台开发依赖 `svelte`、`vite`、`@sveltejs/vite-plugin-svelte`，运行时没有额外依赖。
- Security：
  - 涉及鉴权、令牌、支付回调和 PocketBase 原生接口的暴露面。
  - 每个阶段要有契约测试证明鉴权与脱敏行为不变。
- Release：
  - 每个阶段按发布门禁执行：备份 `pb_data`、迁移、旁路验证、切换路由。
  - 回退只需把对应模块改回转发 Hono。
