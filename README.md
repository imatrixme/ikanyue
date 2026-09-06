# kanyue

看乐项目 monorepo。根仓库使用 Git submodule 管理各子项目入口，各子项目继续保持独立仓库、独立依赖、独立锁文件和独立发布节奏。

## Projects

| Path | Description | Runtime |
| --- | --- | --- |
| `ikanyue.taro3` | 微信小程序 | Taro / Vue |
| `ikanyue.mapi.hono` | 后端 API | Hono / Node.js or Bun |
| `kanyue.pay` | 独立支付网关（当前仅 mock） | Hono / Bun 1.4.1 / 独立 PocketBase |
| `ikanyue.admin` | 运营后台 | React / Vite |
| `ikanyue.website` | 看乐声乐官网 | Next.js |
| `ikanyue.m.nuxt` | 活动页网站 | Nuxt |
| `ikanyue.flutter` | 规划中的 Flutter App | Flutter |

## Usage

这个仓库没有根 `package.json`，也没有根 workspace 配置。进入具体子模块后按该项目自己的 README、锁文件和脚本操作。

`kanyue.pay` 保持独立仓库、依赖和锁文件，远程为 `git@github.com:imatrixme/ikanyue.pay.git`；根仓库通过 submodule 记录其提交引用。

```bash
cd ikanyue.taro3
pnpm install
pnpm dev:weapp
```

```bash
cd ikanyue.mapi.hono
pnpm install
pnpm dev
```

```bash
cd ikanyue.m.nuxt
npm install
npm run dev
```

```bash
cd ikanyue.flutter
flutter pub get
flutter run
```

## Git layout

各子项目都作为 submodule 注册在根仓库中。根仓库记录的是每个子模块的远端地址、跟踪分支和当前 commit 指针。

| Path | Remote | Branch |
| --- | --- | --- |
| `ikanyue.taro3` | `git@github.com:imatrixme/ikanyue.taro3.git` | `release/2.0.0` |
| `ikanyue.mapi.hono` | `git@github.com:imatrixme/ikanyue.mapi.hono.git` | `release/2.0.0` |
| `kanyue.pay` | `git@github.com:imatrixme/ikanyue.pay.git` | `master` |
| `ikanyue.admin` | `git@github.com:imatrixme/ikanyue.admin.git` | `release/2.0.0` |
| `ikanyue.website` | `git@github.com:imatrixme/ikanyue.website.git` | `release/2.0.0` |
| `ikanyue.m.nuxt` | `git@github.com:imatrixme/ikanyue.m.nuxt.git` | `master` |
| `ikanyue.flutter` | `git@github.com:imatrixme/ikanyue.flutter.git` | `douyin` |

四个活跃产品项目与父仓库使用以下版本线：

- 稳定基线：`release/2.0.0`
- 课程点系统：`feature/course-credit-system`

## Course credit system documents

- Product requirements: [`docs/product/course-credit-system-prd.md`](docs/product/course-credit-system-prd.md)
- Technical design: [`docs/architecture/course-credit-system-technical-design.md`](docs/architecture/course-credit-system-technical-design.md)
- Data model: [`docs/architecture/course-credit-system-data-model.md`](docs/architecture/course-credit-system-data-model.md)
- OpenSpec change: [`openspec/changes/add-course-credit-system/`](openspec/changes/add-course-credit-system/)

首次 clone：

```bash
git clone --recurse-submodules <repo-url>
```

已有 clone 初始化子模块：

```bash
git submodule update --init --recursive
```

拉取根仓库和子模块：

```bash
git pull
git submodule update --init --recursive
```

把子模块更新到 `.gitmodules` 中配置的跟踪分支最新提交：

```bash
git submodule update --remote --merge
```

在子模块中独立开发：

```bash
cd ikanyue.taro3
git switch release/wechat-points-lite
git pull
# edit, commit, push in this submodule repository
```

子模块提交推送后，回到根仓库提交新的子模块指针：

```bash
cd ..
git status
git add ikanyue.taro3
git commit -m "Update ikanyue.taro3 submodule"
```

## Unified environment startup

根目录使用同一个入口管理本地测试环境和正式 Compose 环境：

```bash
# 首次显式初始化：两个独立 PocketBase、课程和支付测试数据
./scripts/kanyue-stack.sh test init

# 日常启动：两个 PocketBase、支付网关、Hono、恢复 worker、admin、小程序 watcher
./scripts/kanyue-stack.sh test

# 查看状态、日志、健康检查与关闭
./scripts/kanyue-stack.sh test status
./scripts/kanyue-stack.sh test logs
./scripts/kanyue-stack.sh test smoke
./scripts/kanyue-stack.sh test down
```

本地测试不使用 Docker。`init` 显式创建 `.local/native/environment.json`（权限 0600）、独立业务库和支付库，初始化 schema 与测试数据。普通 `up/restart` 不迁移、不造数据、不修改既有 Docker 卷。业务库账号 `admin@local.com / admin870329`；Admin `admin / admin870329`；学员 `13800000001 / admin870329`；教师 `13800000000 / admin870329`。支付库密码和两个服务令牌随机生成，仅保存于忽略提交的本地配置。这些测试账号只绑定回环地址。

默认端口：Admin `18180`、业务 API `1437`、支付网关 `1440`、业务 PocketBase `18190`、支付 PocketBase `18192`。停止只处理经过 PID 与启动令牌校验的自有进程，端口冲突不会杀掉其他服务。

运行前分别安装各子项目依赖。支付网关固定 Bun 1.4.1，可在根目录独立安装工具链（不创建根 JS 工作区）：

```bash
npm install --prefix .local/toolchains/bun-1.4.1 bun@1.4.1
# PocketBase 0.32.0 可执行文件放在 .local/bin/pocketbase
# kanyue.pay 内使用上述 Bun 执行 install --frozen-lockfile
./scripts/kanyue-stack.sh test restart gateway
./scripts/kanyue-stack.sh test logs commerce-worker
node scripts/commerce-smoke.mjs
```

在微信开发者工具中打开 `ikanyue.taro3` 项目目录，其 `project.config.json` 指向 `dist/` 构建产物。本地模拟支付不会扣真实款；`commerce-smoke` 会留下带联调标识的订单记录，不清空数据。真机不能访问 Mac 的 `127.0.0.1`，LAN 暴露需要另行显式配置。发布边界见 [支付架构决策](docs/architecture/payment-gateway.md)。

支付运营入口是 Admin 的「收款与退款」：订单管理、课程商品、待处理异常、账单与到账。支持按姓名查订单、按原实付规则退款、发布分时间点取消政策、异常重试和账单核对。`node scripts/commerce-smoke.mjs --tiered` 验证分时点现金退费及失败重试。真实微信通道代码有显式上线门禁，本地仍为响应 mock；商户号、真机收银台和真实账单验收未完成前不要开启真实收款。

当前本地支付模式为 `wechatpay-mock`：微信 API v3 请求签名、应答验签、通知解密实际执行，仅渠道 HTTP 响应和收银结果模拟，不访问真实微信支付。既有 `mock` 订单保留原渠道；支付 schema 升级需显式执行，不随普通启动迁移。接口与验收边界见 [支付网关说明](kanyue.pay/README.md)。

## 1Panel / OpenResty deploy

根仓库提供轻量教务闭环的 Docker Compose 编排：PocketBase、Hono API、React admin。线上运维按 1Panel + OpenResty 使用：1Panel 导入 `compose.yaml` 构建并运行服务，OpenResty 负责把公网域名反向代理到 admin 容器暴露的端口。

```bash
cp .env.deploy.example .env.deploy
./scripts/kanyue-stack.sh prod up --confirm-production
```

在 1Panel 中导入 `compose.yaml`，设置 `.env.deploy` 中的端口、PocketBase 超级用户、公开文件域名、微信配置。OpenResty 站点反代到 `http://127.0.0.1:${ADMIN_PORT}`。

默认端口：

| Service | URL |
| --- | --- |
| Admin | `http://127.0.0.1:8080` |
| Hono API | `http://127.0.0.1:1337` |
| PocketBase | `http://127.0.0.1:8090` |

admin 容器内通过 Nginx 把 `/ops/*` 反向代理到 Hono，因此前端构建时使用 `VITE_OPS_API_BASE=/ops`。Hono 容器使用 `PB_URL=http://pocketbase:8090` 连接同一 compose 网络里的 PocketBase。

实物图片采用 PocketBase 托管写入、MinIO 公开读取：Admin 把 multipart 文件上传到 Hono，Hono 完成管理员鉴权和文件校验后写入 PocketBase 的 `reward_items.imageFile` 文件字段；PocketBase 再通过自身的 S3 存储配置写入 MinIO。Hono 返回记录时使用 `PUBLIC_ASSET_BASE_URL=https://kyoss.abcmem.com/ikanyue-mp` 拼接 `{collectionId}/{recordId}/{filename}`，Admin 和小程序直接访问公开 bucket URL，不经过 PocketBase 域名。`PUBLIC_ASSET_BASE_URL` 为空时仅用于本地开发，回退到 `${PB_PUBLIC_URL:-$PB_URL}/api/files/...`。

S3 endpoint、bucket、access key 和 secret key 只在 PocketBase 管理配置中维护，Admin、Hono 和小程序都不持有这些凭据。生产部署前必须在 `.env.deploy` 中替换 `PB_EMAIL` 和 `PB_PASSWORD`，并确认公开 bucket 的只读访问策略及 `PUBLIC_ASSET_BASE_URL` 与实际对象路径一致。

`prod` 模式只负责启动、重启、停止和检查已经准备好的 Compose 服务，不自动构建发布镜像、不执行 PocketBase schema 迁移、不写入测试数据、不构建小程序，也不修改 OpenResty。正式发布仍须按 `.codex/skills/kanyue-deploy/references/deployment-runbook.md` 完成备份、旁路验证、schema 迁移和流量切换。

旁路验证 Docker 版本时使用高位端口，并默认只绑定 `127.0.0.1`，不切换线上域名：

```bash
cp .env.bypass.example .env.bypass
docker compose --env-file .env.bypass -p kanyue_bypass up -d --build
curl -fsS http://127.0.0.1:18080/
curl -fsS -X POST http://127.0.0.1:18080/ops/auth/login \
  -H 'Content-Type: application/json' \
  -d '{}'
```
