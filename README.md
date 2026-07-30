# kanyue

看乐项目 monorepo。根仓库使用 Git submodule 管理各子项目入口，各子项目继续保持独立仓库、独立依赖、独立锁文件和独立发布节奏。

## Projects

| Path | Description | Runtime |
| --- | --- | --- |
| `ikanyue.taro3` | 微信小程序 | Taro / Vue |
| `ikanyue.mapi.hono` | 后端 API | Hono / Node.js or Bun |
| `ikanyue.admin` | 运营后台 | React / Vite |
| `ikanyue.website` | 看乐声乐官网 | Next.js |
| `ikanyue.m.nuxt` | 活动页网站 | Nuxt |
| `ikanyue.flutter` | 规划中的 Flutter App | Flutter |

## Usage

这个仓库没有根 `package.json`，也没有根 workspace 配置。进入具体子模块后按该项目自己的 README、锁文件和脚本操作。

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
# 本地测试：PocketBase、Hono、admin、小程序 watcher
./scripts/kanyue-stack.sh test

# 查看状态、日志、健康检查与关闭
./scripts/kanyue-stack.sh test status
./scripts/kanyue-stack.sh test logs
./scripts/kanyue-stack.sh test smoke
./scripts/kanyue-stack.sh test down
```

首次运行会从 `.env.localdocker.example` 自动创建忽略提交的 `.env.localdocker`，构建 Docker 镜像、初始化 PocketBase schema 与本地测试数据，并将小程序输出到 `ikanyue.taro3/dist`。默认后台账号为 `admin / admin870329`，PocketBase 超级用户为 `admin@local.com / admin870329`，本地学员账号为 `13800000001 / admin870329`。每个未封禁学员首次会获得 10 节“成人声乐一对一”本地课时，可直接在小程序中选择教师和时段报课；重启不会重置已经消耗的课时。这些弱口令只允许配合 `BIND_ADDR=127.0.0.1` 使用。

重复启动默认利用 Docker 构建缓存；只想启动现有镜像时使用：

```bash
./scripts/kanyue-stack.sh test up --no-build
```

本地 schema/种子脚本需要先在 `ikanyue.mapi.hono` 安装依赖；小程序依赖由 Compose 的 `test` profile 单独安装和缓存。在微信开发者工具中打开生成的 `ikanyue.taro3/dist` 目录。

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
