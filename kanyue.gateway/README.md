# kanyue.gateway

自研 API 网关，一期替代阿里云 API 网关。一个 Go 二进制，内嵌独立的 PocketBase v0.39.11：

- **数据面**：`GATEWAY_LISTEN`（默认 `127.0.0.1:1460`），接 OpenResty 转来的公网 API 流量。
- **管理面**：PocketBase `--http`（默认只允许回环/私网地址，如 `127.0.0.1:1461`），包括：
  - 配置集合与 `/gateway/v1/*`（上线、下线、回滚、预览、状态、生效策略、影响预览、日志、指标、Prometheus 抓取、依赖图、告警事件、心跳注册）；
  - 控制台 `/console/`。

设计与验收见 `openspec/changes/add-kanyue-gateway`；API 分组、三环境与策略组见 `openspec/changes/add-gateway-api-groups`。

## 服务发现与接口暴露

- **服务发现是全量登记的**：
  - `kanyue.server`、`kanyue.pay` 通过 `gatewaylink` 每 10 秒心跳注册，连续 3 次缺失下线，停机时注销；
  - 也支持 DNS 与经确认的静态实例。
- **接口发现只登记候选**：
  - 网关在注册或清单哈希变化时拉取实例的 `/internal/gateway/manifest`；
  - 新接口记为“待接入”，消失的记为“已移除”。
- **只暴露显式登记并上线的 API**：
  - 每个 API 从接口清单里选一个接口登记，没有“全部接口”这种快捷方式，新接口不会自动挂载；
  - 登记或修改只是草稿，点“上线”到某个环境后该环境才生效，否则继续使用原来的配置；
  - 引用已移除或其他服务的接口、没有健康实例（可强制并填写原因）都会让上线失败；
  - 内部接口不要登记。

## API 分组、环境与策略组

- **分组**（`api_groups`）：API 归集到分组，分组绑定域名（`group_domains`），一个域名只属于一个分组。
- **API**（`apis`）：方法 + 路径 + 接口 + 公开/私有 + 鉴权（`passthrough`/`none`/`jwt`/`signature`）+ 路径优先级 + 超时，可选 API 策略组和本 API 覆盖项。私有 API 必须用签名鉴权，只放行被授权的应用。
- **环境**：`TEST`、`PRE`、`RELEASE`。请求按“域名绑定的环境 > `X-Ca-Stage` 头 > `RELEASE`”选择环境，未知环境返回 400。
- **策略组**（`policy_sets`）：一组插件配置，每项可锁定、限定环境、设置优先级。生效顺序固定，不支持组合：
  1. 平台基线 `baseline`（作用于全部 API）；
  2. 分组默认策略组；
  3. API 策略组；
  4. API 覆盖项；
  5. 鉴权（由 API 的鉴权方式决定）；
  6. 应用（消费者）策略。

  同名插件下层覆盖上层，“关闭”可去掉继承的未锁定项；锁定项下层不能修改或关闭；限流逐层叠加。
- **应用与授权**（`consumers`、`grants`）：应用持有 AppKey/AppSecret，授权到分组或 API、可限定环境。
- **上线**：`POST /gateway/v1/release`（`/offline`、`/rollback` 同参数），以 `(环境, 分组或 API)` 为单位记版本：
  - 每次上线把目标的完整配置（含当时的应用、密钥与服务实例）快照进 `releases`，环境整体配置存 `stage_versions`；两者与审计只追加；
  - 上线 `RELEASE` 时若与 `PRE` 不一致会返回 409 和差异，需填写原因；
  - 下线从未上线的目标会报错；回滚是把历史版本再次上线，也记新版本。
- **预览**：`/preview` 返回与当前生效版本、与预发的差异；`/apis/{id}/effective` 给出逐层生效策略；`/impact` 在保存前列出一项修改会影响哪些 API、哪些会被锁定拒绝。
- **语义变化**：限流与熔断按 API 计数（原来按路由）；应用、密钥与服务实例在上线时冻结，修改后需重新上线。
- **最近可用快照**：每个环境一份 `gateway-snapshot-<stage>.json`，启动时数据库不可用则用它继续服务。

### 从站点/路由迁移

- 新版本执行 `migrate up`（建新集合）后，首次 `serve` 时自动转换数据：先做 PocketBase 备份 `pre-api-groups-*.zip`（在数据目录的 `backups/` 下），再把每个站点转成分组、每条路由勾选的接口转成 API，按原已发布配置在三个环境各上线 v1，并比对迁移前后的生效配置，不一致则整体回滚。
- 原站点、路由、插件集合保留只读，未发布的修改不会迁移（日志会列出）。
- 回退：停网关，用备份 zip 恢复数据目录，再运行旧版本。

## 暴露清单（mapi.ikanyue.com）

阿里云网关目前只公开小程序在用的接口；迁移时照此登记，不导入 Swagger。

- 清单：`internal/exposure/mapi.json`，内容是分组 `mapi`（域名 `mapi.ikanyue.com`）登记的 `kanyue.server` 接口。
  - 清单内嵌进二进制。
  - 写法与接口清单一致：`METHOD /path/{param}`。
- 应用：`kanyue-gateway exposure apply mapi --dir=… --encryptionEnv=GATEWAY_ENCRYPTION_KEY`。
  - 分组的域名和 API 草稿会被改成恰好与清单一致，并记审计；清单外的 API 草稿会被删除，但已上线的仍在服务，需手动下线。
  - **不会上线**，在控制台核对后依次上线到 TEST、PRE、RELEASE。
  - 控制台里对这些 API 的接口、方法、路径的手工修改，会在下次应用时被覆盖。
  - server 当前没提供的接口（例如 `COURSE_COMMERCE_ENABLED` 未开时的下单接口）会被列出并跳过；开启后再应用一次即可。
- 守卫：
  - `node --test scripts/gateway-exposure.test.mjs` 要求清单与 `ikanyue.taro3/utils` 里的 `iNet` 调用一致。只有 `mock-pay` 例外，它只在开发环境注册。
  - kanyue.server 的清单测试要求清单里每个接口都由 server 提供，且不是 `ops` 或 `service` 接口。
  - 小程序新增接口时，同一次改动里更新清单。

## 本地开发

在仓库根目录：

1. `node scripts/native-stack.mjs init`：
   - 创建 `.local/native/gateway-data`、执行迁移、建控制台超管；
   - 注册令牌和加密密钥随机生成，只存在被忽略的 `.local/native/environment.json`。
2. `node scripts/native-stack.mjs up`：按网关 → server → pay → stages → 小程序的顺序启动。
   - server 与 pay 自己注册为 RELEASE 实例。
   - `stages` 用回环中继端口（server `14371`/`14372`，pay `14401`/`14402`）把同一组进程注册为 TEST/PRE 实例，三个环境都能本地联调；它不另起 PocketBase，不会重复跑定时任务。

控制台登录需要密码加验证器动态码。先在本目录绑定验证器：

```sh
GATEWAY_ENCRYPTION_KEY=<environment.json 中的值> \
  go run . totp enroll <超管邮箱> --dir=../.local/native/gateway-data --encryptionEnv=GATEWAY_ENCRYPTION_KEY
```

- 验证器密钥加密存储，所以命令必须带上与 `serve` 相同的 `--encryptionEnv` 和密钥。

- 命令会打印 `otpauth://` 链接，用验证器 App 添加。
- `totp remove <邮箱>` 解绑。
- 邮件 OTP 被关闭，只接受 TOTP，同一个码不能用两次。

控制台源码在 `console/`（React + Vite + TS + Tailwind，与 `ikanyue.admin` 同栈，品牌 token 由 `scripts/sync-design-tokens.mjs` 生成）：

```sh
cd console
npm ci
npm run dev     # http://127.0.0.1:5173/console/，/api 与 /gateway 代理到 127.0.0.1:1461
npm test
npm run lint
npm run build   # 产物写入 internal/console/site，随 go build 嵌入
```

- `console/go.mod` 只是一个标记，作用是让 `go ./...` 跳过 `node_modules`（部分 npm 包自带 `.go` 文件）。
- 没有构建产物时网关照常运行，`/console/` 返回 404。

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `GATEWAY_LISTEN` | `127.0.0.1:1460` | 数据面监听地址 |
| `GATEWAY_REGISTRATION_TOKEN` | — | 服务心跳注册令牌，至少 32 字符；server/pay 用同名变量 |
| `GATEWAY_TRUSTED_PROXIES` | `127.0.0.1,::1` | 可信上一跳（IP 或 CIDR），客户端 IP 取 `X-Forwarded-For` 最右侧不可信地址 |
| `GATEWAY_ADMIN_PUBLIC` | — | `1` 时允许管理面绑定非私网地址；只在容器内（宿主机只在回环发布端口）使用 |
| `GATEWAY_RELEASE_APPROVAL` | — | `1` 时上线到 RELEASE 需要另一身份批准（见“自动化与审批”） |
| `--encryptionEnv=<变量名>` | — | 启动参数。指向 32 字符密钥，用于加密插件密钥、消费者 AppSecret、告警/导出密钥、TOTP 种子与 PocketBase 设置；不设则无法保存这些密钥 |
| `GATEWAY_LOG_SAMPLE` | `0.1` | 成功请求的日志采样率；错误、无响应、插件错误与慢请求全量保留 |
| `GATEWAY_LOG_SLOW_MS` | `1000` | 慢请求阈值 |
| `GATEWAY_LOG_TRUNCATE_IP` | — | `1` 时日志中的 IP 截断到 /24（IPv4）或 /48（IPv6） |
| `GATEWAY_LOG_RETENTION_DAYS` | `7` | 请求日志保留天数（本地 `telemetry.db`） |
| `GATEWAY_METRIC_RETENTION_DAYS` | `90` | 分钟指标保留天数 |
| `BACKUP_CRON`、`BACKUP_KEEP` | —、`7` | PocketBase 定时备份；不设 `BACKUP_CRON` 时沿用面板设置 |
| `BACKUP_S3_ENDPOINT`、`_BUCKET`、`_REGION`、`_ACCESS_KEY`、`_SECRET`、`_FORCE_PATH_STYLE` | — | 备份存 S3；必须同时设置加密密钥，S3 密钥才会加密落库 |

- `BACKUP_*` 在 `kanyue.server`、`kanyue.pay` 中含义相同。
- 每个服务在心跳里上报最近一次备份结果，网关在概览页展示；规则模板 `backup-overdue` 在超时、失败或从未备份时告警。

## 自动化与审批

访问令牌（控制台“访问令牌”页签发）：

- 给 CI 和脚本调用管理面 `/gateway/v1`，请求头 `Authorization: Bearer kgt_…`；
- 角色：
  - `viewer`：只读，可看状态、预览、比对、导出配置；
  - `releaser`：另可上线、下线、回滚到签发时勾选的环境，并批准这些环境的上线申请；
  - `admin`：另可应用配置、测试导出目标；
- 令牌只在签发时显示一次，库里只存哈希；删除即吊销；可设过期日期，最近使用时间按分钟记录；
- 令牌不能访问 PocketBase 数据集合，也不能签发令牌（只有登录的超管可以）；被拒的请求和令牌做的变更都写入审计（操作人 `token:<名称>`）。

上线生产的二次批准（`GATEWAY_RELEASE_APPROVAL=1`）：

- 上线到 RELEASE 返回 202 并生成申请，其他环境不受影响；另一身份在“审批”页或 `POST /gateway/v1/approvals/{id}/approve` 批准；
- 申请记下所选对象解析出的定义摘要，批准时草稿必须仍解析为同样的定义，否则申请作废（需重新申请）；24 小时后过期；
- 批准时上线检查失败（如没有健康实例）则申请回到待批准，并记下原因；
- 下线、回滚不需要批准，事故处理时要快；都写入审计。

配置即代码：

```sh
kanyue-gateway config export mapi-drafts.json --dir=… --encryptionEnv=GATEWAY_ENCRYPTION_KEY
kanyue-gateway config apply mapi-drafts.json --dry-run --dir=… --encryptionEnv=GATEWAY_ENCRYPTION_KEY
```

- 文件包含策略组、分组（域名、API）与授权，按名称引用；API 用“服务 + `METHOD /path`”引用接口；不含任何密钥值（插件按名称引用密钥，应用及其 AppSecret 只在控制台维护）；
- `apply` 让草稿与文件完全一致（文件里没有的分组、API、域名、授权、策略组会删除草稿，平台基线除外），在一个事务里完成并逐条列出差异、写入审计；`--dry-run` 只列差异；
- 只改草稿，不上线；已上线的对象在各环境照常服务，直到上线或下线；
- 名称就是身份：改名等于删除再新建；
- 也可用令牌调用：`GET /gateway/v1/config`（viewer）、`POST /gateway/v1/config/apply?dryRun=1`（admin）。

环境比对：控制台“环境比对”页或 `GET /gateway/v1/compare?from=PRE&to=RELEASE`，按正在生效的版本列出不一致的分组与 API。

## 部署

`compose.yaml` 里的 `gateway` 服务放在 `gateway` profile 下：

```sh
docker compose --profile gateway up -d gateway
```

给 `server` 设置以下变量后它会注册：

- `GATEWAY_URL=http://gateway:1461`
- `GATEWAY_REGISTRATION_TOKEN`

数据卷 `gateway_data`。

切流前的检查：

- server 注册后运行 `kanyue-gateway exposure apply mapi`，在控制台核对分组与 API，依次上线到 TEST、PRE、RELEASE；
- 上线检查会要求每个服务在默认服务环境 `RELEASE` 至少一个健康实例（只有 LOCAL 等其他服务环境的实例不算）；
- 每个环境只把请求转给该环境的实例：TEST/PRE 需要以 `GATEWAY_STAGE=TEST`/`PRE` 注册的实例（地址不同，实例按服务 + 地址唯一），否则返回 503；
- 逐个环境跑契约测试：`BASE_URL=https://mapi.ikanyue.com CONTRACT_STAGE=<环境> node --test "kanyue.server/contract/*.test.mjs"`。
  - `mapi` 只暴露小程序接口，`/ops/*` 等用例会因 404“接口不存在”失败，这是预期；要验证全量契约，用绑定 `*` 的分组，并设 `COMPARE_URL` 为直连 server 做读一致性对比；
- 再把 OpenResty 的 API 域名指到数据面。

域名与 HTTPS：

- 网关不终止 TLS、不管理证书；分组绑定的域名只用于按 `Host` 选择分组（和固定环境）。证书仍由 1Panel 申请与续期。
- 每给分组绑定一个域名，就在 1Panel 的同一个反代站点里加上这个域名，并让证书覆盖它（证书加 SAN，或用 DNS 验证申请 `*.ikanyue.com` 通配证书）。
  - 推荐 DNS 验证：不依赖 80 端口和流量走向，也能签通配证书。
  - 用 HTTP 验证时，1Panel 自己应答 `/.well-known/acme-challenge/`，不会转给网关。
- 反代必须保留 `Host`（`proxy_set_header Host $host`），否则网关匹配不到分组；`X-Forwarded-For` 只信任 `GATEWAY_TRUSTED_PROXIES` 里的上一跳。
- 1Panel 里有站点、网关里没绑定的域名会返回 404；网关里绑定了、1Panel 里没加的域名根本到不了网关。两边要同时改。

1Panel OpenResty 站点示例（TLS 由 1Panel 终止与续期）：

```nginx
upstream kanyue_gateway {
    server 127.0.0.1:1460 max_fails=1 fail_timeout=2s;
    server 127.0.0.1:1470 backup;      # gateway-standby，只在升级期间运行
    keepalive 64;
}

server {
    listen 443 ssl;
    http2 on;
    server_name mapi.ikanyue.com;
    # ssl_certificate / ssl_certificate_key 由 1Panel 管理

    client_max_body_size 20m;          # 与 body-limit 插件一致或更大
    location / {
        proxy_pass http://kanyue_gateway;
        proxy_next_upstream error timeout;   # 连接被拒时转到 backup，请求尚未发出
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;           # SSE 与长连接
        proxy_read_timeout 300s;
    }
}
```

- WebSocket 需要额外加 `Upgrade`/`Connection` 头映射；当前业务未使用。
- 管理面 `1461` 不配置任何站点，用 SSH 隧道访问：
  - 执行 `ssh -L 1461:127.0.0.1:1461 <host>`；
  - 然后打开 `http://127.0.0.1:1461/console/`。

### 零停机升级

在仓库根目录运行：

```sh
node scripts/gateway-rollout.mjs        # 已构建好镜像时加 --no-build
```

流程：

1. 构建镜像 `kanyue-gateway:local`；
2. 用新镜像启动 `gateway-standby`（数据面 `1470`、管理面 `1471`，共用 `gateway_data`），等它健康；
3. 重建 `gateway`：旧进程收到 SIGTERM 后排空在途请求（最多 10 秒，停止宽限 30 秒），新连接被拒，OpenResty 转给 `backup`；
4. 等新的 `gateway` 健康，再停掉 `gateway-standby`。

失败时：

- standby 起不来：脚本停掉 standby 并退出，`gateway` 没有被动过；
- 新 `gateway` 起不来：standby 继续承接流量，修好后重跑脚本。

两个进程同时运行时：

- 每 5 秒各自对齐一次：别的进程上线的版本、注册或下线的实例都会被采用，所以升级期间仍可上线和注册；
- 分钟指标按主键合并，两边写同一分钟会累加，不丢数；
- 告警可能被两个进程各评估一次，几十秒的窗口内可能重复通知；
- 新版本启动时会执行迁移，旧进程要能读迁移后的库。发布说明标了“不兼容的 schema 变更”的版本，改用停机升级：`docker compose --profile gateway up -d --build gateway`。
- 升级内嵌的 PocketBase 时同样按停机升级处理，并先备份数据目录：新版本会在库上执行系统迁移（v0.32 → v0.39.11 会重存带索引的集合）；要回退旧镜像，先用升级前的备份恢复数据目录。
- PocketBase v0.39 起自带 SQL 控制台（`POST /api/sql`）；网关将其关闭（403），因为直接执行 SQL 会绕过审计与上线记录的只追加保护。

### 轮换加密密钥

离线命令，要求独占数据目录锁：网关（或 standby）在运行时会被拒绝。

1. 生成新的 32 字符密钥，放进另一个环境变量，例如 `GATEWAY_ENCRYPTION_KEY_NEXT`；
2. 停网关：`docker compose --profile gateway stop gateway gateway-standby`；
3. 运行：

   ```sh
   docker compose --profile gateway run --rm --no-deps -e GATEWAY_ENCRYPTION_KEY_NEXT gateway \
     kanyue-gateway rotate-key --dir=/pb_data --encryptionEnv=GATEWAY_ENCRYPTION_KEY --newKeyEnv=GATEWAY_ENCRYPTION_KEY_NEXT
   ```

4. 把 `GATEWAY_ENCRYPTION_KEY` 换成新密钥，启动网关。

命令做的事：

- 先备份为 `pre-rotate-key-*.zip`；
- 所有 `enc:v1:` 密文（插件密钥、消费者 AppSecret、告警与导出密钥、TOTP 种子，以及环境版本、上线记录里的副本）先全部用旧密钥解开，有一个解不开就中止，什么都不写；
- 在一个事务里用新密钥重新加密并写回，同时用新密钥保存 PocketBase 设置；之后改写最近可用快照文件，并逐个环境用新密钥编译校验；
- 输出只含计数；审计里记一条 `rotate-key`。

中途失败可以直接重跑：已经是新密钥的值会保留并计入 `already`。

旧密钥不要丢：轮换前的备份（包括 `pre-rotate-key-*.zip`）只能用旧密钥恢复，保留到这些备份过期为止。

## 同机 VictoriaLogs（可选）

网关不内嵌、不托管日志系统。需要长期检索时，用控制台“日志导出”接入同机 VictoriaLogs：

- **安装**：官方单二进制或镜像，只监听回环，例如：
  ```
  victoria-logs -httpListenAddr=127.0.0.1:9428 -storageDataPath=/var/lib/victoria-logs \
    -retentionPeriod=30d -memory.allowedBytes=128MiB
  ```
- **导出配置**：
  - 地址 `http://127.0.0.1:9428/insert/jsonline`；
  - Stream 字段 `stage,group,service`；
  - 认证为“无”（只在回环），或在前面加 Basic Auth 反代。
- **启用前的连接测试**：保存时会自动做，失败不能启用。
- **故障时**：
  - 导出失败按 1 秒到 60 秒退避重试，5 次后丢弃该批并计数；
  - 本地日志不受影响；
  - `export-failing` 模板会告警。
- **查询界面没有鉴权**，只通过以下方式访问：
  - SSH 隧道（`ssh -L 9428:127.0.0.1:9428 <host>`）；
  - 或 1Panel 带 Basic Auth 的反代。
- **1C1G 机器上的资源**：用 `-memory.allowedBytes` 和保留期控制内存，与网关、业务服务一起纳入整机内存观察。

## 外部监控、请求校验与响应头

- **Prometheus 抓取**：`GET /gateway/v1/prometheus`（管理面，文本格式 0.0.4）。用 `viewer` 机器令牌作 bearer token：
  ```yaml
  scrape_configs:
    - job_name: kanyue-gateway
      authorization: { credentials_file: /etc/prometheus/kanyue-gateway.token }
      metrics_path: /gateway/v1/prometheus
      static_configs: [{ targets: ["127.0.0.1:1461"] }]   # 升级期间另加 127.0.0.1:1471
  ```
  - 指标：`kanyue_gateway_requests_total`（按环境、分组、API、服务、状态类别）、`kanyue_gateway_request_duration_seconds` 直方图、收发字节、日志与导出丢弃、导出是否在失败、各环境生效版本、实例健康与在途请求、插件信号（如熔断打开）、镜像丢弃；
  - 进程指标供长稳判断泄漏：`process_resident_memory_bytes`（仅 Linux）、`go_memstats_heap_inuse_bytes`、`go_memstats_sys_bytes`、`go_goroutines`、遥测库大小 `kanyue_gateway_telemetry_bytes`；
  - 计数从进程启动算起，每个进程各自计数；主备轮换时各抓各的端口，由 Prometheus 处理重置。
- **OpenTelemetry trace**：控制台“日志导出”选择格式“OTLP/HTTP JSON（trace）”，地址如 `http://127.0.0.1:4318/v1/traces`（OpenTelemetry Collector、Tempo、Jaeger 均可接收）：
  - 每个请求一个 server span：trace 沿用调用方的 `traceparent`，父 span 是调用方的 span；网关把自己的 span 传给上游，服务的 span 挂在它下面；
  - 采样、只导出错误、失败退避与日志导出相同；审计与告警事件不发送；
  - 5xx 与网关未能应答的请求标为错误，4xx 不算错误。
- **按 OpenAPI 校验请求**：插件 `request-validation`（优先级 650，鉴权之后、限流之前），配置 `maxBodyBytes`（默认 1 MiB）：
  - 校验依据是服务清单里该接口的 `parameters`（`query`、`header`；路径级参数被接口级同名参数覆盖）和 `requestBody` 的 `application/json` schema，清单同步时存到接口上，上线时冻结；
  - 绑定到清单没有声明参数或请求体的接口会上线失败；schema 使用 `$ref` 也会上线失败（服务需内联）；
  - 只校验与插件配置相同的 JSON Schema 子集（type、properties、required、additionalProperties、items、enum、最值、长度、pattern），其他关键字不检查；路径参数不校验；
  - 不通过返回 400，`X-Ca-Error-Message: Invalid Parameter: <原因>`；请求体超过上限返回 413。
  - 目前 `kanyue.server`、`kanyue.pay` 的清单还没有声明参数与请求体，服务补上之前这个插件无处可绑。
- **响应头改写**：`request-rewrite` 的 `responseSetHeaders` / `responseRemoveHeaders`（如去掉 `X-Powered-By`、加 `Cache-Control`），值可用 `{requestId}` 等变量；`Content-Length`、`Transfer-Encoding`、`Connection` 等分帧头不能改写。只作用于上游的响应，网关自己的错误应答不经过它。

## 验证

```sh
gofmt -l .
GOMAXPROCS=1 go vet -p 1 ./...
GOMAXPROCS=1 TZ=Asia/Shanghai go test -p 1 -parallel 1 ./...
GOMAXPROCS=1 go test -tags load -run TestLoad -v ./internal/control/   # 需要 ab
```

本地压测用的是 `ab`，单位为整毫秒，结果只能作参考：

- **环境**：Apple Silicon 开发机，`GOMAXPROCS=1`，32 个长连接，1 KB 响应；插件链 request-id + jwt-auth + rate-limit + 日志（10% 采样）。
- **结果**：
  - 约 3.4 万 req/s；
  - P99 3 ms，直连上游为 1 ms；
  - 进程堆约 13 MB，向系统申请约 33 MB。
  - 在这个吞吐下日志队列有少量丢弃，已计数，且可由 `dropped-logs` 模板告警。
- **结论**：1C1G VPS 的正式数字以 G3 在目标机器上用 k6/wrk 实测为准。

恢复演练 `TestBackupRestoresReleasedConfiguration` 的步骤：

1. 备份数据目录；
2. 解压到新目录；
3. 按每个环境最新的 `stage_versions` 加载并继续服务。

## 目标机器验证

在 VPS 上执行（`harden-gateway-operations` 第 4 节）。工具只读或只发请求，不改线上配置：

- 压测、长稳、带压升级都用 `scripts/gateway-drill.mjs`（Node 22，无依赖）；
- 密钥只走环境变量：`DRILL_AUTHORIZATION` 是请求的 `Authorization`，`DRILL_METRICS_TOKEN` 是 `viewer` 机器令牌；脚本不打印它们。
- 结果都是一段 JSON，判定不通过时退出码为 1。

**1. 压测（4.1、add-kanyue-gateway 5.1）**：对照 D9 的发布门禁。压测机最好是同机房的另一台机器；同机压测会抢 CPU，结果偏保守。

```sh
DRILL_METRICS_TOKEN=... node scripts/gateway-drill.mjs load --profile 1c1g \
  --url http://127.0.0.1:1460/v1/public/venues --header "Host: mapi.ikanyue.com" \
  --direct http://127.0.0.1:1337/v1/public/venues \
  --metrics http://127.0.0.1:1461/gateway/v1/prometheus --duration 60s --connections 32
```

- `--direct` 直连上游测基线，网关附加延迟 = 网关 P99 − 直连 P99；
- 常驻内存取自 Prometheus 的 `process_resident_memory_bytes`；
- `--profile 2c4g` 用 2 核 4G 的门槛；
- 带鉴权的接口另设 `DRILL_AUTHORIZATION`。

**2. 24 小时长稳（4.1）**：按真实容量（约 200–300 QPS）定速请求，每分钟记一行到 `--out`。

```sh
DRILL_METRICS_TOKEN=... nohup node scripts/gateway-drill.mjs soak --rate 200 --duration 24h --interval 60s \
  --url http://127.0.0.1:1460/v1/public/venues --header "Host: mapi.ikanyue.com" \
  --metrics http://127.0.0.1:1461/gateway/v1/prometheus --out soak.jsonl > soak-result.json &
```

判定：

- 错误率 ≤ 0.1%；
- 常驻内存和协程数：最后一成时间的中位数不超过第二成时间的 1.25 倍（第一成算预热）；
- 遥测库按实测增速推算到保留期（`--retention-days`，默认 7）不超过 `--disk-budget-mb`（默认 1024）。

**3. 真实 S3 恢复演练（4.2、add-kanyue-gateway 4.5）**：从备份存储（配置了 S3 就是 S3）取最新备份，解压到临时目录校验，不启动服务、不碰线上数据，结束后删除临时目录。

```sh
# 网关：完整性检查、迁移到当前版本、各环境最新上线版本用当前密钥能编译
docker compose --profile gateway exec gateway \
  kanyue-gateway backup verify --dir=/pb_data --encryptionEnv=GATEWAY_ENCRYPTION_KEY
# kanyue.server 与 kanyue.pay：完整性检查与资金表计数；PB_EMAIL、PB_PASSWORD 等先 export
docker run --rm --network host -e PB_URL=http://127.0.0.1:8090 -e PB_EMAIL -e PB_PASSWORD "$PAY_IMAGE" \
  kanyue-pay maintenance backup business --latest
docker run --rm --network host -e PAY_PB_URL=http://127.0.0.1:1340 -e PAY_PB_EMAIL -e PAY_PB_PASSWORD "$PAY_IMAGE" \
  kanyue-pay maintenance backup payment --latest
```

- 网关 `backup verify` 不加参数时取最新的一份，最新备份超过 `--max-age`（默认 26h）也算失败；也可以指定备份名。
- `maintenance backup --latest` 不新建备份，最新备份超过 26 小时报 `BACKUP_STALE`；不加 `--latest` 时仍是先新建再校验。

**4. 带压滚动升级（4.4）**：在真实 OpenResty 后面边压边升级，统计升级期间每一个失败请求；不通过时会列出状态码和连接错误。

```sh
node scripts/gateway-drill.mjs rollout --rate 200 --url https://mapi.ikanyue.com/v1/public/venues \
  --command "node scripts/gateway-rollout.mjs --no-build"
```

**5. 阿里云能力对照（4.3、add-kanyue-gateway 0.1）**：用阿里云 CLI（`aliyun configure` 配只读 RAM 用户）导出在用配置，再逐行补全 `openspec/changes/add-kanyue-gateway/design.md` 里“待确认”的能力：

```sh
aliyun cloudapi DescribeApiGroups --RegionId <分组所在地域，如 cn-hangzhou> > aliyun-groups.json
aliyun cloudapi DescribeApis --GroupId <分组> --PageSize 100 > aliyun-apis.json
aliyun cloudapi DescribeApi --GroupId <分组> --ApiId <API>        # 每个 API：参数映射、后端、鉴权
aliyun cloudapi DescribeTrafficControls --GroupId <分组> > aliyun-traffic.json
aliyun cloudapi DescribeIpControls --GroupId <分组> > aliyun-ip.json
aliyun cloudapi DescribePluginsByGroup --GroupId <分组> > aliyun-plugins.json
aliyun cloudapi DescribeDomain --GroupId <分组> --DomainName mapi.ikanyue.com
```

导出文件可能含 AppKey、后端地址等内部信息，只放在 VPS 或本机，不要提交。
