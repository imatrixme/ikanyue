## Context

- 现状：小程序请求 `https://mapi.ikanyue.com`，带 `X-Ca-Stage`（生产 `RELEASE`，开发 `TEST`）、`X-Ca-Nonce`（毫秒时间戳）、`X-Ca-Source: wechat_mp`，未使用 AppKey 签名（`ikanyue.taro3/utils/request.js`）。阿里云网关上的完整配置不在仓库，需要用户导出后对照验收。
- 后端：`kanyue.server`（业务、后台、PocketBase 面板）与 `kanyue.pay`（支付网关）都是内嵌 SQLite 的单进程服务，不能多实例。
- `kanyue.server` 用“请求是否带 `X-Forwarded-For`/`X-Real-IP`/`Forwarded`”判断是否经过反代，以此隐藏 PocketBase `/api/*` 与 `/_/`（`internal/server/server.go`）。
- 资源：起步 1 核 1G，可升级到 2 核 4G、3 Mbps 出口（入口不限）。
- PocketBase 路由器的路由表是私有字段，没有公开的枚举接口；`kanyue.server` 当前约 154 处路由注册（含路由组展开后约 185 个接口）。

## Goals / Non-Goals

- Goals：第一期完全替代阿里云 API 网关；可视化配置；服务与接口靠发现、不靠手填；日志、指标、依赖图、告警；单机可用、设计上可扩成集群。
- Non-Goals：见 proposal；第二、三期能力只预留接口。

## Decisions

### D1. 独立子项目，控制面与数据面同进程、逻辑分离

```text
kanyue.gateway
├── dataplane   监听业务端口；持有 atomic.Pointer[Snapshot]；不读数据库
│   ├── router      编译好的路由表（Host → 站点的 net/http ServeMux）
│   ├── chains      每条路由预先组装的插件链
│   ├── upstreams   负载均衡、健康检查、熔断状态（节点本地）
│   └── sinks       日志/指标/上报的异步通道（满了丢弃并计数）
├── controlplane 只监听内网管理端口；内嵌 PocketBase
│   ├── config.db   站点、环境、服务、接口、路由、插件、消费者、告警规则、配置版本、审计
│   ├── telemetry   日志与指标单独存放（独立 SQLite 文件，按天滚动清理）
│   ├── registry    服务实例注册与心跳、DNS 解析、OpenAPI 拉取
│   ├── publisher   校验 → 编译快照 → 生成版本 → 推给数据面
│   └── alerting    每分钟评估规则，webhook 推送
└── console      管理面板（React + Vite 单页，构建产物 go:embed，挂在管理面 /console/）
```

- 单机：两者同进程，发布即原子替换快照。
- 集群（第二期）：数据面节点用长轮询拉取“版本号 + 快照”，并把最后一次成功的快照落盘；控制面不可用时数据面继续用旧快照转发。节点心跳携带版本，面板显示各节点版本。
- 理由：处理请求的路径上不读库、不加锁；单机与集群共用同一套代码路径。

### D2. 配置模型：发现出来的对象只能被选择

| 对象 | 来源 | 运维能做的 |
|---|---|---|
| 服务（Service） | 自注册 / DNS / 静态登记 | 起名、分组、设置负载均衡与健康检查 |
| 实例（Instance） | 自注册心跳、DNS 解析结果 | 只读；可临时摘除 |
| 接口（Operation） | 服务的 OpenAPI 文档、阿里云 Swagger 导入 | 只读；选择后挂到路由 |
| 路由（Route） | 运维创建：选择站点、环境、接口 | 配匹配条件、插件、流量策略 |
| 消费者（Consumer） | 运维创建 | AppKey/Secret、JWT 声明映射、限流配额 |

- 面板里不出现“自由填写上游地址/路径”的输入框；静态登记是唯一例外，且需要二次确认与审计。
- 服务发现是全量的：注册、心跳、DNS 发现的服务与实例都登记在案。接口发现只“登记可选项”：清单里的接口进入“待接入”列表，不会自动挂到任何路由上。
- 路由只暴露运维逐个勾选的接口；没有勾选任何接口的路由不能发布，也没有“全部接口”的快捷方式。部分接口本来就不对外，不能因为服务注册了就经网关暴露。面板可以按模块、鉴权范围批量勾选，但结果仍是显式的接口列表，写进发布快照。
- 接口文档变化时：新增接口进入“待接入”列表，等运维选择；已删除接口对应的路由标红并告警，不自动删除，选中了它的路由在修正前不能发布。

### D3. 接口清单：由路由表本身生成

- 不在 154 处路由注册上逐个改写包装：`kanyue.server`、`kanyue.pay` 的 `gatewaylink` 包在启动时读取 PocketBase 路由树。路由树是私有字段，所以用反射读取；读取失败时启动报错、守卫测试失败，PocketBase 升级改了结构会立即发现。
- 归属与鉴权范围：
  - 模块名：逐个注册模块，比较注册前后的路由差集得到。
  - 鉴权范围（公开、会话、学员、教师、后台、服务令牌、测试）：每个服务一张按路径前缀匹配的规则表，未覆盖的路由记为 `unclassified`，守卫测试拒绝。
  - 幂等性：按 HTTP 安全方法（GET、HEAD、OPTIONS）判断。
- PocketBase 自带路由里只发布公开的文件下载（`GET /api/files/...`），其余由 `internalOnly` 隐藏，不进清单。
- 输出 OpenAPI 3.1 到 `/internal/gateway/manifest`，只对内（server 复用 `IsInternalRequest`）。清单格式：
  - 路径直接用 `net/http` `ServeMux` 模式，网关也用 `ServeMux` 编译，两边匹配规则一致；
  - 不限方法的路由放在 `x-kanyue-any` 键下；
  - 输出是确定性的，所以 SHA-256 只在路由或版本变化时改变。
- 服务启动后带清单哈希心跳（`GATEWAY_URL`、`GATEWAY_REGISTRATION_TOKEN`、`GATEWAY_INSTANCE_ADDRESS`、`GATEWAY_STAGE`），哈希变化时网关重新拉取清单；退出时先注销再关闭监听。
- 两个服务各带一份完全相同的 `gatewaylink.go`：它们各自独立构建（Docker 构建上下文是子项目目录），清单与心跳的 JSON 才是与网关的契约。

### D4. 插件模型

```go
type Plugin interface {
    Name() string
    Schema() []byte // JSON Schema，面板据此生成表单并校验配置
    Build(config json.RawMessage) (Instance, error) // 发布时编译，失败则拒绝发布
}

type Instance interface {
    Request(*Context) Result  // 鉴权、限流、改写、分流；可直接返回响应
    Response(*Context) Result // 改写响应头、降级替换
    Log(*Context)             // 只读，异步
}
```

- 执行顺序由插件优先级决定，可在路由上覆盖；挂载层级：全局 → 站点 → 路由 → 消费者。
- 环境选择不是插件：实例带环境标签，数据面按 `X-Ca-Stage`（缺省 `RELEASE`）挑选同环境的实例。
- 第一期内置插件：`aliyun-signature`、`replay-guard`、`jwt-auth`、`ip-restriction`、`cors`、`rate-limit`、`request-rewrite`、`body-limit`、`circuit-breaker`、`fallback`、`traffic-split`、`mirror`、`mock`、`maintenance`。
- `X-Request-Id` 与 `traceparent` 由数据面固定生成或透传（见 D6），不是可关闭的插件。
- 第二期：WASM 插件运行时与外部鉴权，实现同一个 `Plugin` 接口。

### D5. 流量治理

- 负载均衡：加权轮询（默认）、最少在途、按用户 ID/请求头的一致性哈希。
- 健康检查：主动（路径、间隔、阈值）+ 被动（连续失败临时摘除，指数退避恢复）。
- 重试：只对 `GET`/`HEAD`/`OPTIONS` 及明确标记幂等的接口，最多一次，并且只在连接失败或上游 502/503/504 时。
- 超时：连接、首字节、整体、空闲四级，路由可覆盖服务默认值。
- 熔断：按“上游 + 路由”统计错误率与慢调用比例，打开后返回 `fallback` 配置的兜底响应或维护页。
- 灰度：按权重、请求头、Cookie、用户 ID 哈希；同一用户稳定落在同一版本。流量镜像只复制请求，丢弃镜像响应，不计入用户延迟。
- 适用边界：`kanyue.server`、`kanyue.pay` 只有一个实例，不能做版本灰度；这些能力服务于官网、静态站点与将来的无状态服务。

### D6. 真实 IP 与转发头

- 网关只信任配置的上一跳（默认 `127.0.0.1`，即 1Panel OpenResty），从 `X-Forwarded-For` 中取最右侧不可信地址作为客户端 IP。
- 转发到上游时**总是**设置 `X-Forwarded-For`、`X-Real-IP`、`X-Forwarded-Proto`、`X-Forwarded-Host`、`X-Request-Id`、`traceparent`。这是 `kanyue.server` 隐藏 PocketBase 管理接口的前提，有专门测试守护。
- 鉴权通过后注入 `X-Kanyue-Consumer`、`X-Kanyue-User`；上游如需信任这些头，必须同时校验网关签名头（第一期：`kanyue.server` 先不依赖这些头，继续自己验 JWT）。

### D7. 观测

- 请求日志：时间、站点、环境、路由、接口、服务实例、方法、状态码、耗时、上下行字节、客户端 IP、消费者、traceId、错误原因。错误与慢请求（阈值可配）全量保留，成功请求按比例采样；内存缓冲，每秒或每 1000 条批量写一次。
- 指标：内存中按“路由 × 分钟”聚合计数与延迟直方图，分钟结束后落盘；写盘量与请求量无关。
- 依赖图：节点是站点、路由、服务、外部依赖；边来自网关的转发统计，加上服务上报的出站调用（`kanyue.server` → `kanyue.pay`、微信、对象存储、outbox webhook，按分钟聚合上报）。边上显示 QPS、错误率、P95。
- 告警：规则 = 指标 + 条件 + 持续时间 + 通知渠道；内置模板：5xx 比例、P95 延迟、上游实例全部不健康、熔断打开、支付回调失败、outbox 死信积压、日志丢弃数、证书即将过期（读取 1Panel 证书文件的到期时间）。告警恢复也会通知。
- 保留期：日志默认 7 天，指标默认 90 天，可配置。

### D8. 管理面与安全

- 管理端口只绑内网；PocketBase 超级用户登录，开启 TOTP 二次验证：沿用 PocketBase 的 MFA 流程（密码 → `mfaId` → OTP），OTP 一步由钩子改为校验验证器动态码，邮件 OTP 关闭，同一个码不能重复使用；验证器用 `kanyue-gateway totp enroll` 在服务器上绑定，密钥加密保存。
- 所有配置写入经控制面接口，带审计（谁、何时、改了什么、发布哪个版本）。
- AppSecret、Webhook 密钥、日志导出令牌加密保存（AES-GCM，主密钥来自 PocketBase `--encryptionEnv` 指定的环境变量，不进库、不进仓库）；保存后只显示掩码与指纹，不出现在日志与审计明细里。
- 发布前校验：路由冲突、插件配置 Schema、引用的服务/接口存在、默认环境 `RELEASE` 至少一个健康实例（可强制跳过并记录原因）；“没有健康实例”告警同样只看 `RELEASE`。

### D9. 性能设计

- 路由匹配与插件链在发布时编译；请求路径无锁、无数据库访问。
- 基于 `net/http` 反向代理，流式转发；按需缓冲请求体并有上限；缓冲区复用。
- 上游长连接池按服务配置；支持 HTTP/2 上游。
- `GOMEMLIMIT` 控制内存上限；日志与指标通道有界，满了丢弃并计数。
- 压测目标（发布门禁，k6 或 wrk，响应 1 KB，默认插件链：request-id、jwt-auth、rate-limit、日志）：

| 机器 | 吞吐目标 | 网关附加延迟 P99 | 常驻内存 |
|---|---|---|---|
| 1 核 1G | ≥ 3,000 QPS | < 2 ms | < 100 MB |
| 2 核 4G | ≥ 10,000 QPS | < 1 ms | < 150 MB |

- 实际容量估算：3 Mbps 出口约 320 KB/s 有效，接口响应压缩后约 1 KB 时约 200–300 QPS；带宽先于网关成为瓶颈。

### D10. 日志与外部集成：通用协议，一期只做最小闭环

日志分成两条链路，各自可以替换：

- **LogStore（查询）**：面板的日志检索与请求明细只通过这个接口读取。一期只有本地 SQLite 实现（热数据，默认保留 7 天）；二期增加 VictoriaLogs 查询后端，面板可以直接查 VictoriaLogs。
- **Exporter（写出）**：把请求日志、审计与告警事件发到外部平台。数据面只把记录放进内存中的有界队列，导出失败不影响转发。

```go
type Exporter interface {
    Export(ctx context.Context, batch []Record) error
    Probe(ctx context.Context) error // 测试连接：写一条带标记的测试记录
    Close() error
}
```

**一期范围（最小闭环）**：

- **导出协议**：只实现 JSON lines over HTTP（NDJSON）一种。它直接对接 VictoriaLogs 的 `/insert/jsonline`，也能被 OpenObserve、Vector、Fluent Bit 等工具接收。
  - 配置项：地址、可选的 Basic Auth 或 Bearer 令牌、字段映射（`_msg`、`_time`、stream 字段）、采样率、筛选条件。
  - 失败处理：按条数或时间批量发送，失败后指数退避重试；队列满了丢弃并计数，导出持续失败时告警。
  - 不做磁盘缓冲：本地 SQLite 已经保留 7 天，导出中断期间的数据仍然可以在面板里查到。
- **部署形态**：VictoriaLogs 由运维在同一台机器上单独部署，网关不内嵌、不托管它。
  - 只绑定 `127.0.0.1`；
  - 用 `-retentionPeriod` 控制保留期，并限制内存占用；
  - 它自带的查询界面没有鉴权，只能通过 SSH 隧道或 1Panel 加 Basic Auth 反代访问。
- **对象存储（S3 兼容）**：只用 PocketBase 内置的定时备份。
  - 网关配置库：定时备份，配置版本本身就在库里。
  - `kanyue.server`、`kanyue.pay`：各自内嵌 PocketBase 的定时备份写入 S3，S3 凭据通过各自的启动参数配置。三个服务都开启 PocketBase `--encryptionEnv`，让存在设置里的 S3 密钥加密保存。
  - 各服务在心跳里上报最近一次备份的结果，网关展示状态并在超时未备份时告警。网关不读取业务数据。
- **告警通道**：带 HMAC 签名的 JSON webhook，加上用户选定的一个即时通知渠道。
- **默认脱敏**：导出与本地日志都不记录 `token`、`Authorization`、Cookie、请求体与响应体，也不记录个人信息；客户端 IP 可以选择截断。

**后续期（同一接口，按需增加）**：

| 期次 | 内容 |
|---|---|
| 二期 | VictoriaLogs 作为 LogStore 查询后端；Elasticsearch `_bulk`、Loki push、OTLP/HTTP 导出协议；Prometheus `/metrics`；CloudEvents 与 Alertmanager 格式的告警；导出磁盘缓冲；按天把请求日志归档为 Parquet 存进 S3（纯 Go 写入，离线用 DuckDB 等工具分析）；配置版本归档到 S3；STS 临时凭据；发往境外的连接器必须先确认个人信息出境评估 |
| 三期 | 厂商私有协议：阿里云 SLS `PutLogs`、AWS CloudWatch Logs；外部凭据源（Vault、AWS Secrets Manager、阿里云 KMS）；OIDC 单点登录管理面 |

如果阿里云配置导出显示 SLS 里有必须保留的日志，就先把 SLS 原样导出留档，而不是在一期实现 SLS 写入。

**资源预算（1 核 1G，同机部署）**：网关 < 100 MB；VictoriaLogs 用内存上限参数控制在约 100–150 MB；其余内存留给 `kanyue.server`、`kanyue.pay`、OpenResty 与 1Panel。G3 压测时一起测整机内存。

## 阿里云 API 网关能力对照（第一期验收清单）

| 阿里云能力 | 现状 | 第一期实现 |
|---|---|---|
| API 分组 + 自定义域名 + SSL 证书 | 使用中 | 站点；TLS 由 1Panel OpenResty 终止与续期 |
| 环境（RELEASE / PRE / TEST） | 使用中（`X-Ca-Stage`） | 数据面按请求头选同环境的实例，缺省 `RELEASE`（G0 已实现） |
| API 定义：方法、路径、参数透传 | 使用中 | 接口发现 + 路由 |
| 参数映射、常量参数、系统参数 | 待确认 | `request-rewrite` |
| 后端：HTTP / Mock | 待确认 | 服务 + `mock` |
| 后端：VPC、函数计算 | 待确认 | 不适用（VPS 内网服务即 HTTP 后端） |
| 发布、下线、历史版本回滚 | 使用中 | 配置版本与回滚 |
| 认证：无认证 | 使用中 | 默认 |
| 认证：阿里云 APP（AppKey + 签名） | 未发现客户端使用 | `aliyun-signature`（兼容签名规则） |
| 认证：OpenID Connect / JWT | 待确认 | `jwt-auth` |
| 防重放（Nonce + Timestamp） | 客户端发送 Nonce | `replay-guard`（仅签名鉴权下生效，与阿里云一致） |
| 流量控制（API / 用户 / APP，秒 / 分 / 天） | 待确认 | `rate-limit` |
| IP 访问控制 | 待确认 | `ip-restriction` |
| 跨域 | 待确认 | `cors` |
| 请求体大小、超时 | 使用中（默认值） | `body-limit`、超时配置 |
| 错误响应头（`X-Ca-Request-Id`、`X-Ca-Error-Message`） | 待确认客户端是否依赖 | 默认返回 `X-Ca-Request-Id`；错误时附 `X-Ca-Error-Message` |
| 日志服务 SLS、云监控告警 | 待确认 | 本地请求日志、指标、告警；外部日志用 JSON lines 导出到自建 VictoriaLogs（D10） |
| 结果缓存 | 待确认 | 若在用，第一期补 `cache` 插件；否则放第二期 |
| WebSocket | 待确认 | 原生支持 |
| Swagger 导入导出 | — | 导入阿里云导出的 Swagger（含 `x-aliyun-apigateway-*` 扩展）生成服务、接口、路由草稿 |

“待确认”项在拿到阿里云配置导出后定稿：在用的必须在第一期实现并通过对照测试，未用的可以下放。

## 阶段与发布

| 阶段 | 内容 | 上线条件 |
|---|---|---|
| G0 底座 | 数据面、快照发布、服务与接口发现、`kanyue.server`/`kanyue.pay` 接口清单 | 守卫测试证明清单完整；转发头测试通过 |
| G1 阿里云替代 | 对照表中在用的全部能力、面板 | 对照测试逐项通过；契约测试经网关全部通过 |
| G2 观测与集成 | 日志、指标、依赖图、告警；JSON lines 导出到 VictoriaLogs；PocketBase S3 定时备份 | 告警演练（停掉上游、制造 5xx）能收到通知与恢复通知；停掉 VictoriaLogs 时转发不受影响、本地日志仍可查；从 S3 恢复一次备份并通过检查 |
| G3 切换 | VPS 旁路验证 → DNS 切换 → 观察期 | 压测达标；小程序真机全流程；支付回调经网关验证 |

回退：G3 观察期内保留阿里云网关，回退即切回 DNS。

## Risks

- **ICP 备案与小程序合法域名**：域名切到新的 VPS 需要该服务商的备案接入；未完成前不能切换 DNS。
- **管理面暴露**：管理端口误开到公网会导致配置可被篡改；默认只绑内网，并有启动检查。
- **转发头缺失**：会让 `kanyue.server` 暴露 PocketBase 管理接口；由 D6 的测试与上线检查守护。
- **单点**：VPS 单机即单点；集群设计预留，第一期靠备份、监控与 DNS 回退兜底。
- **凭据泄露**：S3 密钥一旦泄露，备份可能被读取或篡改；一期靠 PocketBase `--encryptionEnv` 加密设置、只给指定前缀的最小权限、开启存储桶版本控制来降低风险。
- **备份泄露与个人信息出境**：业务备份含学员个人信息与密码哈希，存储桶必须私有并开启服务端加密；存储桶选在境外区域前需要先做个人信息出境评估。
- **同机资源争用**：VictoriaLogs 与业务服务共用 1 核 1G；靠内存上限、保留期与采样控制，整机内存纳入 G3 压测。
- **自研维护成本**：插件生态需要自己积累；第二期的 WASM 与外部鉴权用于降低定制成本。
