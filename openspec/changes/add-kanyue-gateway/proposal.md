## Why

线上 API 现在经阿里云 API 网关（经典版）进入：小程序固定发 `X-Ca-Stage`（`RELEASE`/`TEST`）、`X-Ca-Nonce`、`X-Ca-Source`，域名 `mapi.ikanyue.com` 解析到云网关，再转发到后端。这让部署绑死在云厂商上，本地无法复现线上链路，看不到每个接口的流量去向，也无法按自己的需要加鉴权、灰度、降级。

目标（2026-10-27 起，America/Los_Angeles）：服务迁到自有 VPS，证书与自动续期继续交给 1Panel；新增一个自研、独立部署的 Go 单二进制网关 `kanyue.gateway`，第一期就能完全替代阿里云 API 网关，并提供可视化的路由与中间件管理、服务与接口发现、日志、流量与依赖图、告警。网关从设计上按控制面/数据面分离，后续可以平滑扩成集群。

资源目标：1 核 1G 上可用；2 核 4G、3 Mbps 出口带宽时，网关本身不是瓶颈（出口带宽才是）。

## What Changes

### 新子项目 `kanyue.gateway`（第一期）
- Go 单二进制，内嵌 PocketBase 保存配置、日志、指标与告警；配置库与日志库分开；带内置管理面板（静态单页，`go:embed`）。管理面只对内开放。
- **阿里云 API 网关替代**（逐项对照见 `design.md` → 阿里云能力对照）：
  - 域名/站点与环境：`X-Ca-Stage` 选择环境（缺省 `RELEASE`），每个环境绑定自己的上游。
  - API 定义：方法、路径（含路径参数）、请求透传，可选的请求头/查询参数改写、常量与系统参数注入、请求体大小限制。
  - 后端类型：HTTP 服务与 Mock 响应。
  - 鉴权：无认证、AppKey + HMAC 签名（兼容阿里云 `X-Ca-Key`/`X-Ca-Signature` 规则）、JWT（验 `kanyue.server` 签发的令牌，与业务服务同一密钥与规则）。
  - 防重放（`X-Ca-Nonce` + `X-Ca-Timestamp`，仅在签名鉴权下生效）、IP 白名单/黑名单、跨域。
  - 流量控制：按 API、按应用、按用户，按秒/分/天。
  - 发布与回滚：每次发布生成配置版本，可一键回滚；所有改动有审计。
  - 日志与告警：替代 SLS 与云监控（本地日志加自建 VictoriaLogs，见 `design.md` D10）。
- **服务发现与接口发现**（运维在面板里选择，不手填地址与路径字符串）：
  - 服务发现：服务启动时向网关注册并心跳（自注册）、DNS、少量静态登记三种来源；面板里只能选择已发现的服务实例。
  - 接口发现：网关拉取服务暴露的 OpenAPI 文档并生成可选的接口清单；现有阿里云网关只公开小程序在用的接口，迁移时用仓库内的暴露清单（`mapi`）登记这些接口，不做 Swagger 导入。
  - `kanyue.server` 与 `kanyue.pay` 新增只对内的接口清单 `/internal/gateway/manifest`（OpenAPI 3.1，由路由注册自动生成，含模块、鉴权范围、是否幂等），并自注册到网关。
- **流量治理**：多实例负载均衡（加权轮询、最少在途、一致性哈希）、主动与被动健康检查、仅幂等请求重试、超时分级、熔断与降级（兜底响应、维护页）、灰度分流（权重、请求头、Cookie、用户 ID 哈希）、流量镜像。
- **协议**：HTTP/1.1、HTTP/2、WebSocket、SSE（流式不缓冲）。
- **插件**：Go 内置插件接口（请求、响应、日志三个阶段），插件配置用 JSON Schema 描述，面板据此自动生成表单；按全局、路由、消费者三级挂载。
- **观测**：请求日志（异步批量写入、错误与慢请求全量、成功请求采样）、分钟级路由指标（请求数、状态码、P50/P95/P99）、依赖图（网关视角的路由→服务，加上服务上报的出站调用）、告警规则与 webhook 推送（企业微信、飞书、钉钉、Telegram、邮件，按配置选择）。
- **日志与外部集成（一期只做最小闭环，接口可替换）**：
  - 日志分为查询（LogStore）和写出（Exporter）两个接口。一期查询只用本地 SQLite（热数据保留 7 天）。
  - 一期写出只实现 JSON lines over HTTP 一种通用协议，直接对接运维在同机自建的 VictoriaLogs（`/insert/jsonline`，只绑定 `127.0.0.1`）。导出失败只重试和计数，不影响转发。
  - 备份只用 PocketBase 内置的定时 S3 备份（兼容 AWS S3、OSS、COS、R2、MinIO 等）：网关、`kanyue.server`、`kanyue.pay` 各自备份自己的数据，并开启 `--encryptionEnv` 加密保存 S3 密钥；网关只汇总各服务最近一次备份的结果并告警。
  - 默认脱敏：不记录令牌、Cookie、请求体与响应体，也不记录个人信息。
- **集群前瞻**：数据面只持有不可变配置快照，控制面按版本发布；节点心跳与版本上报；健康检查接口；优雅重启与 `SO_REUSEPORT` 平滑升级；限流、日志、指标走可替换的接口（单机实现先落地）。

### 后续期（本变更只预留接口，不实现）
- 第二期：gRPC 代理（含 gRPC 反射做接口发现、gRPC-Web）、WASM 插件（wazero，评估 Proxy-Wasm 兼容）、外部鉴权、Redis 全局限流、多节点集群的配置下发、VictoriaLogs 作为面板查询后端、更多通用日志协议（Elasticsearch `_bulk`、Loki push、OTLP）、Prometheus `/metrics`、Parquet 日志归档到 S3、导出磁盘缓冲、声明式配置导入导出、客户端加密备份。
- 第三期：TCP/UDP 四层代理、SOCKS5（仅限鉴权后的出站代理）、Consul/Kubernetes/Nacos 服务发现、gRPC 与 HTTP 互转、厂商私有日志协议（阿里云 SLS、AWS CloudWatch Logs）、外部凭据源（Vault、AWS Secrets Manager、阿里云 KMS）、OIDC 单点登录管理面。

### 部署
- 生产链路：公网 443 → 1Panel OpenResty（证书与自动续期）→ `kanyue.gateway` → `kanyue.server` / `kanyue.pay` / 官网。
- 静态资源与图片继续走对象存储/CDN，不占 VPS 出口带宽。
- 切换方式：VPS 上旁路验证后，把 `mapi.ikanyue.com` 从阿里云网关切到 VPS；阿里云网关保留到观察期结束，回退即切回 DNS。

## Non-goals

- 不改小程序、官网、后台的接口地址与契约；`X-Ca-*` 请求头照常发送。
- 不让 `kanyue.server`、`kanyue.pay` 多实例运行：它们内嵌 SQLite，同一份数据只能由一个进程打开；业务灰度仍用服务内功能开关。网关的灰度分流服务于无状态服务与静态站点。
- 不做通用日志全文检索与完整分布式追踪存储；需要时转发给外部平台。
- 网关第一期不自己签发证书；TLS 由 1Panel 的 OpenResty 终止。

## Impact

- Affected specs：新增 `api-gateway-runtime`、`api-gateway-policies`、`api-gateway-observability`、`service-api-discovery`、`gateway-integrations`。
- Affected code：
  - 新增 `kanyue.gateway`（Go module、内嵌面板）。
  - `kanyue.server`、`kanyue.pay`：路由登记生成接口清单、自注册、出站调用上报；开启 `--encryptionEnv` 与 PocketBase 定时 S3 备份，并在心跳中上报备份结果。
  - `compose.yaml`、`scripts/native-stack.mjs`：新增 `gateway` 服务（本地端口另定，避免与支付网关 `1440` 冲突）。
  - `.codex/skills/kanyue-deploy`、`README.md`、`AGENTS.md`、`GEB.MD` §8：部署链路与项目地图，以及同机部署 VictoriaLogs 的说明（只绑定本机、保留期、内存上限、查询界面的访问方式）。
- Dependencies：沿用 PocketBase v0.32.0（S3 客户端与定时备份也复用它）；不引入 etcd、Redis、ClickHouse，也不引入任何云厂商 SDK。VictoriaLogs 是独立部署的外部进程，不是网关的依赖：没有它时网关照常运行。面板构建需要 Node（与后台相同）。
- Privacy：业务备份含学员个人信息与密码哈希，存储桶必须私有并开启服务端加密；存储桶选在境外区域前需要先做个人信息出境评估。日志默认剔除个人信息字段。
- Security：网关成为唯一公网入口，涉及鉴权、签名、真实 IP、管理面暴露与配置审计；必须保证转发时设置 `X-Forwarded-For`/`X-Real-IP`，否则 `kanyue.server` 会把转发请求当作内网请求，暴露 PocketBase `/api/*` 与 `/_/`。
- Release：域名切换前需确认 VPS 服务商与所在地（不限阿里云；备案不作为本变更的前置条件）；切换前后保留阿里云网关作为回退。
- 需要用户提供：阿里云 API 网关当前配置的导出（API 列表、环境、流控、IP 控制、插件），用于第一期逐项对照与验收。
