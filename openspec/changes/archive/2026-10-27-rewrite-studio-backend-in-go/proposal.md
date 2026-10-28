## Why

现在跑起一个工作室约课系统，要同时维护业务 PocketBase、Hono API、恢复 worker、nginx 托管的 React 后台，外加独立的支付网关和支付库。业务和数据不在同一进程里，Hono 只能通过 HTTP 调 PocketBase，拿不到数据库事务。为此不得不用 Batch API 模拟原子写入、启动时检查批量上限、写 outbox 与补偿逻辑。表结构也有三处来源：`pb_migrations`、`ops:schema:apply` 和启动检查。

PocketBase 本身就是 Go 写的，可以作为库嵌进业务程序。用 Go 重写业务后端，就能在同一进程里使用真正的 SQLite 事务，把数据库、业务接口、定时任务和后台页面合成一个可执行文件，同时直接沿用现有 `pb_data`，不需要迁移数据。

目标形态（2026-10-27 起，America/Los_Angeles）：业务后端与支付网关各是一个 Go 单二进制，各自内嵌 PocketBase、各自带只对内开放的数据面板；后台是嵌在业务二进制里的静态单页应用。Hono 全部下线。

## What Changes

### 业务服务 `kanyue.server`
- 把 PocketBase v0.32.0 作为库嵌入，直接打开现有业务 `pb_data`。替代独立的业务 PocketBase 进程和 Hono。
- 写操作在 `RunInTransaction` 中完成。课时账本、预约、结算的多集合写入在一个事务里提交或回滚。
- 保持现有接口契约不变：
  - 路径、`{code: 10000, message, data}` 响应包、错误同样返回 HTTP 200。
  - JWT（HS256，同一个 `JWT_SECRET`，相同 claims 与有效期）。
  - 小程序、官网、支付网关都不用改，已登录用户也不用重新登录。
- **按模块逐步接管（绞杀榕）**：过渡期 Go 服务放在最前面，已迁移的路由由 Go 处理，其余原样转发给 Hono。全部模块迁完后删除转发与 Hono。
- PocketBase 自带的 `/api/*` 和数据面板 `/_/` 只对内开放（内网或 SSH 隧道），公网请求一律拒绝；面板只用于查看与排查，业务写入一律走业务接口。
- 表结构由 Go 版本化迁移统一管理，通过显式命令执行，启动时不自动迁移；空库上 `migrate up` 能建出全部集合。
- 定时任务（预约过期与兑现、课时过期、对账、outbox、收款恢复）在进程内调度。

### 迁移范围：有调用方的接口全部迁移，没有调用方的删除
1. 身份：微信登录、角色选择、刷新、资料，后台登录与改密。
2. 场馆：公开列表、后台管理。
3. 学员档案与跟进。
4. 课程与课时包：课程规格、课时类型、课时包、价格版本、公开课程目录（官网）、课程点转换规则管理。
5. 报课与课时账本：报课、发放、账户、批次延期与恢复、过期、对账异常、学员课时与上课记录。
6. 约课：预约策略、开放课程、可约时间与例外、学员、老师与后台预约（含确认、拒绝、取消、改期）、冲突处理、排课回填。
7. 课表与出勤结算：班级、课堂、发布、取消、改期、出勤、结算、冲正、课表日历、老师课表、教师工作量确认。
8. 线上报课收款：商品、下单、收银台、退款、恢复、对账，以及支付网关事件回调。
9. 活动列表、积分与实物兑换（小程序与后台）。
10. 历史数据迁移与影子对账（上线前执行一次）。
11. 操作审计、outbox 与指标。

没有调用方、随 Hono 一起删除的接口：`/v1/course-credits/*`（学员自助预留与转换）、`POST /v1/user/avatar`、`/debug/routes`、`/swagger`。迁移清单以小程序、后台、官网、支付网关实际调用的接口为准，详见 `design.md`。

### 支付网关 `kanyue.pay`
- 用 Go 重写为单二进制，内嵌自己的 PocketBase 与 `pb_data`，带只对内开放的数据面板；与业务数据仍然分库、分进程。
- 对 `kanyue.server` 的接口（下单、查询、退款、对账单、恢复任务、事件回调）契约不变。

### 后台
- 现有 React 后台去掉 SSR，构建成静态单页应用，用 `go:embed` 嵌进 `kanyue.server`，和 `/ops` 同源；不再需要单独的 nginx 容器。
- 页面与权限不变，范围外页面不再存在：积分、历史迁移、教师工作量都改由 Go 接口提供。

## Non-goals

- 不改数据模型的业务含义，不做数据迁移；过渡期 Hono 与 Go 必须能读写同一份数据。
- 不改小程序和官网；它们的接口地址和契约保持不变。
- 不在本变更里重写后台框架（Svelte 化另行决定）。
- 不做多租户、SaaS 授权。

## Impact

- Affected specs：新增 `studio-server-runtime`、`studio-admin-console`、`payment-gateway-runtime`。
- Affected code：
  - `kanyue.server`：新增剩余模块、基线迁移、后台静态资源嵌入；最后删除 Hono 转发。
  - `kanyue.pay`：TypeScript 实现替换为 Go。
  - `ikanyue.mapi.hono`：全部删除。
  - `ikanyue.admin`：去掉 SSR 与 nginx，产物嵌入 `kanyue.server`。
  - `compose.yaml`、`scripts/native-stack.mjs`：只剩 `server` 与 `pay` 两个服务。
- Architecture：
  - 推翻 `docs/architecture/course-credit-system-technical-design.md` §5.1 的“PocketBase 不承载业务、禁止事务与 hook”决策，见 `design.md`。
  - `GEB.MD` §8 中“客户端只通过 Hono API 访问”改为“只通过业务 API（`kanyue.server`）访问”。
- Dependencies：生产依赖 `github.com/pocketbase/pocketbase` v0.32.0（与线上数据库版本一致）；JWT 使用它已带的 `golang-jwt/jwt/v5`。Node 只在构建后台与跑契约测试时需要。
- Security：涉及鉴权、令牌、支付签名与回调、数据面板的暴露面；每个阶段要有契约或单元测试证明鉴权与脱敏行为不变。
- Release：每个阶段按发布门禁执行：备份 `pb_data`、迁移、旁路验证、切换。删除 Hono 之前的最后一次发布仍可用 `KANYUE_HONO_MODULES` 回退；删除之后回退靠换回上一版二进制与 `pb_data` 备份。
