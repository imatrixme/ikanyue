# kanyue.gateway

自研 API 网关，一期替代阿里云 API 网关。一个 Go 二进制，内嵌独立的 PocketBase v0.32.0：

- **数据面**：`GATEWAY_LISTEN`（默认 `127.0.0.1:1460`），接 OpenResty 转来的公网 API 流量。
- **管理面**：PocketBase `--http`（默认只允许回环/私网地址，如 `127.0.0.1:1461`），包括：
  - 配置集合与 `/gateway/v1/*`（上线、下线、回滚、预览、状态、生效策略、影响预览、日志、指标、依赖图、告警事件、心跳注册）；
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
2. `node scripts/native-stack.mjs up`：按网关 → server → pay → 小程序的顺序启动，server 与 pay 自动注册。

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
    server 127.0.0.1:1460;
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

真实 S3 的恢复演练需在 VPS 上进行。
