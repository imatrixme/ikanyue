# kanyue

看乐项目单一仓库（monorepo）。各子项目保留在原目录，原独立仓库的提交历史已并入本仓库；依赖、锁文件和发布节奏仍按子项目各自独立。

## Projects

| Path | Description | Runtime |
| --- | --- | --- |
| `ikanyue.mini` | 微信小程序（学员与教师），原生小程序 + 自有薄封装 `kit/`，无构建步骤 | WeChat 原生 / Sass（开发者工具编译） |
| `kanyue.server` | 业务服务单体：API + 内嵌 PocketBase（数据面板 `/_/`）+ 内嵌运营后台 | Go / PocketBase v0.39.11 |
| `kanyue.pay` | 独立支付网关单体（当前仅 mock） | Go / 独立内嵌 PocketBase v0.39.11 |
| `ikanyue.admin` | 运营后台（静态 SPA，构建后嵌入 `kanyue.server`） | React / Vite |
| `ikanyue.website` | 看乐声乐官网 | Nuxt 4 |

`ikanyue.m.nuxt`（旧活动页）和 `ikanyue.flutter`（规划中的 App）不在本仓库内，仍是各自的独立仓库；需要时克隆到根目录同名位置即可，根 `.gitignore` 已忽略这两个目录。

## Usage

这个仓库没有根 `package.json`，也没有根 workspace 配置。进入具体子项目后按该项目自己的 README、锁文件和脚本操作。

```bash
cd ikanyue.mini
pnpm install
pnpm lint
TZ=Asia/Shanghai pnpm test
```

```bash
cd kanyue.server
GOMAXPROCS=1 TZ=Asia/Shanghai go test -p 1 -parallel 1 ./...
```

## Git layout

只有一个仓库、一条主线 `master`。跨子项目的改动（例如 API、后台、小程序同时改）放在同一次提交里，不再分仓库提交、也不再维护子模块指针。

原独立仓库（`imatrixme/ikanyue.taro3`（已由 `ikanyue.mini` 取代）、`ikanyue.mapi.hono`（已由 `kanyue.server` 取代并删除）、`ikanyue.admin`、`ikanyue.website`、`ikanyue.pay`）的历史已按目录并入，可用 `git log -- <目录>` 查看；这些旧仓库只作归档，不再提交。
## Course credit system documents

- Product requirements: [`docs/product/course-credit-system-prd.md`](docs/product/course-credit-system-prd.md)
- Technical design: [`docs/architecture/course-credit-system-technical-design.md`](docs/architecture/course-credit-system-technical-design.md)
- Data model: [`docs/architecture/course-credit-system-data-model.md`](docs/architecture/course-credit-system-data-model.md)
- OpenSpec change: [`openspec/changes/add-course-credit-system/`](openspec/changes/add-course-credit-system/)


## Unified environment startup

本地测试不使用 Docker，入口是 `node scripts/native-stack.mjs`（`./scripts/kanyue-stack.sh test …` 是同一入口）：

```bash
# 首次显式初始化：编译三个 Go 服务到 .local/native/bin，迁移两个库、写入本地测试数据（seed local）
node scripts/native-stack.mjs init

# 运营后台嵌入 server 二进制：首次和改动后端前先构建
(cd ikanyue.admin && npm run build:server)

# 日常启动：API 网关、kanyue.server、kanyue.pay、TEST/PRE 中继（stages）
# up/restart 先编译要启动的 Go 服务（编译失败时不停旧进程），再直接运行二进制；--no-build 复用上次编译结果
node scripts/native-stack.mjs up

# 查看状态、日志、健康检查与关闭
node scripts/native-stack.mjs status
node scripts/native-stack.mjs logs server
node scripts/native-stack.mjs smoke
node scripts/native-stack.mjs down
```

`init` 显式创建 `.local/native/environment.json`（权限 0600），对业务库和支付库执行 `migrate up`，并写入本地测试数据；普通 `up/restart` 不迁移、不造数据、不修改既有 Docker 卷，两个服务都会在有未执行迁移时拒绝启动。业务库 PocketBase 面板 `admin@local.com / admin870329`；后台 `admin / admin870329`；学员 `13800000001 / admin870329`；教师 `13800000000 / admin870329`。支付库面板密码和两个服务令牌随机生成，仅保存于忽略提交的本地配置。这些测试账号只绑定回环地址。

默认端口：业务服务 `1437`（后台页面、API、PocketBase 面板 `/_/`）、支付网关 `1440`（服务名 `pay`；API、PocketBase 面板 `/_/`）、API 网关 `1460`（数据面）与 `1461`（管理面，控制台 `/console/`）。本地业务服务和支付网关会向 API 网关心跳注册；控制台登录需要密码加验证器动态码，先在 `kanyue.gateway` 以 `.local/native/environment.json` 里的 `GATEWAY_ENCRYPTION_KEY` 为环境变量运行 `go run . totp enroll <邮箱> --dir=../.local/native/gateway-data --encryptionEnv=GATEWAY_ENCRYPTION_KEY` 绑定。停止只处理经过 PID 与启动令牌校验的自有进程，端口冲突不会杀掉其他服务。后台改界面时可在 `ikanyue.admin` 运行 `npm run dev`（代理 `/ops` 到 `1437`）。

```bash
node scripts/native-stack.mjs restart pay
node scripts/commerce-smoke.mjs --tiered
```

在微信开发者工具中打开 `ikanyue.mini` 项目目录（`miniprogramRoot` 是 `miniprogram/`，源码即代码包，由开发者工具编译 Sass，无需 watcher）。开发版请求本地 server `127.0.0.1:1437` 并带 `X-Ca-Stage: TEST`，体验版和正式版请求 `https://mapi.ikanyue.com` 的 RELEASE。本地模拟支付不会扣真实款；`commerce-smoke` 会留下带联调标识的订单记录，不清空数据。真机不能访问 Mac 的 `127.0.0.1`，LAN 暴露需要另行显式配置。发布边界见 [支付架构决策](docs/architecture/payment-gateway.md)。

支付运营入口是后台的「收款与退款」：订单管理、课程商品、待处理异常、账单与到账。支持按姓名查订单、按原实付规则退款、发布分时间点取消政策、异常重试和账单核对。`node scripts/commerce-smoke.mjs --tiered` 验证分时点现金退费、失败重试和网关重启恢复。真实微信通道代码有显式上线门禁，本地仍为响应 mock；商户号、真机收银台和真实账单验收未完成前不要开启真实收款。

当前本地支付模式为 `wechatpay-mock`：微信 API v3 请求签名、应答验签、通知解密实际执行，仅渠道 HTTP 响应和收银结果模拟，不访问真实微信支付。支付 schema 升级需显式执行 `kanyue-pay migrate up`，不随普通启动迁移。接口与验收边界见 [支付网关说明](kanyue.pay/README.md)。

## 1Panel / OpenResty deploy

各服务的部署、升级与回滚见 [docs/deployment](docs/deployment/README.md)。

线上只有一个业务容器 `server`（`kanyue.server` 镜像，构建时把 `ikanyue.admin` 作为 `console` 构建上下文打进二进制）。1Panel 导入 `compose.yaml` 构建并运行；OpenResty 把后台域名反代到 `ADMIN_PORT`、API 域名反代到 `API_PORT`、数据域名反代到 `POCKETBASE_PORT`，三个端口进入同一个进程。支付网关单独用 `compose.pay.release.yaml` 发布。

```bash
cp .env.deploy.example .env.deploy
./scripts/kanyue-stack.sh prod up --confirm-production
```

默认端口：

| Service | URL |
| --- | --- |
| 运营后台（同源 `/ops`） | `http://127.0.0.1:8080` |
| 业务 API | `http://127.0.0.1:1337` |
| PocketBase 文件与面板 | `http://127.0.0.1:8090` |

PocketBase REST API 与面板 `/_/` 只响应私网直连（不带反代头），经 OpenResty 进来的请求一律 404；查看数据用 SSH 隧道：`ssh -L 8090:127.0.0.1:8090 <host>` 后打开 `http://127.0.0.1:8090/_/`。`/api/files` 仍公开，供历史图片地址使用。

实物图片采用 PocketBase 托管写入、MinIO 公开读取：后台把 multipart 文件上传到 kanyue.server，服务端完成管理员鉴权和文件校验后写入 PocketBase 的 `reward_items.imageFile` 文件字段；PocketBase 再通过自身的 S3 存储配置写入 MinIO。返回记录时使用 `PUBLIC_ASSET_BASE_URL=https://kyoss.abcmem.com/ikanyue-mp` 拼接 `{collectionId}/{recordId}/{filename}`。`PUBLIC_ASSET_BASE_URL` 为空时仅用于本地开发，回退到 `${PB_PUBLIC_URL:-$PB_URL}/api/files/...`。

S3 endpoint、bucket、access key 和 secret key 只在 PocketBase 管理配置中维护，后台和小程序都不持有这些凭据。生产部署前必须在 `.env.deploy` 中替换 `PB_EMAIL` 和 `PB_PASSWORD`，并确认公开 bucket 的只读访问策略及 `PUBLIC_ASSET_BASE_URL` 与实际对象路径一致。

`JWT_SECRET`（至少 32 位随机字符）必须在 `.env.deploy` 中设置，否则服务拒绝启动。它兼容旧 Hono 签发的令牌；更换该值会让所有已签发令牌失效。发布前先备份，再执行 `docker compose run --rm --entrypoint kanyue-server server migrate up --dir=/pb_data`；有未执行迁移时 `serve` 拒绝启动。

`prod` 模式只负责启动、重启、停止和检查已经准备好的 Compose 服务，不自动构建发布镜像、不执行迁移、不写入测试数据、不构建小程序，也不修改 OpenResty。正式发布仍须按 `.codex/skills/kanyue-deploy/references/deployment-runbook.md` 完成备份、旁路验证、迁移和流量切换。

旁路验证 Docker 版本时使用高位端口，并默认只绑定 `127.0.0.1`，不切换线上域名：

```bash
cp .env.bypass.example .env.bypass
docker compose --env-file .env.bypass -p kanyue_bypass up -d --build
curl -fsS http://127.0.0.1:18080/
curl -fsS -X POST http://127.0.0.1:18080/ops/auth/login \
  -H 'Content-Type: application/json' \
  -d '{}'
```
