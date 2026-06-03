# kanyue

看乐项目 monorepo。根仓库使用 Git submodule 管理各子项目入口，各子项目继续保持独立仓库、独立依赖、独立锁文件和独立发布节奏。

## Projects

| Path | Description | Runtime |
| --- | --- | --- |
| `ikanyue.taro3` | 微信小程序 | Taro 3 / Vue |
| `ikanyue.mapi.hono` | 后端 API | Hono / Node.js or Bun |
| `ikanyue.admin` | 运营后台 | React / Vite |
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
| `ikanyue.taro3` | `git@github.com:imatrixme/ikanyue.taro3.git` | `2604/jieshao` |
| `ikanyue.mapi.hono` | `git@github.com:imatrixme/ikanyue.mapi.hono.git` | `2605/newop` |
| `ikanyue.admin` | `git@github.com:imatrixme/ikanyue.admin.git` | `2605/newop` |
| `ikanyue.m.nuxt` | `git@github.com:imatrixme/ikanyue.m.nuxt.git` | `master` |
| `ikanyue.flutter` | `git@github.com:imatrixme/ikanyue.flutter.git` | `douyin` |

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
git switch 2604/jieshao
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

## 1Panel / OpenResty deploy

根仓库提供轻量教务闭环的 Docker Compose 编排：PocketBase、Hono API、React admin。线上运维按 1Panel + OpenResty 使用：1Panel 导入 `compose.yaml` 构建并运行服务，OpenResty 负责把公网域名反向代理到 admin 容器暴露的端口。

```bash
cp .env.deploy.example .env.deploy
docker compose --env-file .env.deploy up -d --build
```

在 1Panel 中导入 `compose.yaml`，设置 `.env.deploy` 中的端口、PocketBase 超级用户、公开文件域名、微信配置。OpenResty 站点反代到 `http://127.0.0.1:${ADMIN_PORT}`。

默认端口：

| Service | URL |
| --- | --- |
| Admin | `http://127.0.0.1:8080` |
| Hono API | `http://127.0.0.1:1337` |
| PocketBase | `http://127.0.0.1:8090` |

admin 容器内通过 Nginx 把 `/ops/*` 反向代理到 Hono，因此前端构建时使用 `VITE_OPS_API_BASE=/ops`。Hono 容器使用 `PB_URL=http://pocketbase:8090` 连接同一 compose 网络里的 PocketBase；返回文件 URL 时使用 `PUBLIC_ASSET_BASE_URL=https://kyoss.abcmem.com` 拼接公开对象存储地址，业务代码不持有 S3/MinIO key。生产部署前必须在 `.env.deploy` 中替换 `PB_EMAIL` 和 `PB_PASSWORD`。

旁路验证 Docker 版本时使用高位端口，并默认只绑定 `127.0.0.1`，不切换线上域名：

```bash
cp .env.bypass.example .env.bypass
docker compose --env-file .env.bypass -p kanyue_bypass up -d --build
curl -fsS http://127.0.0.1:18080/
curl -fsS -X POST http://127.0.0.1:18080/ops/auth/login \
  -H 'Content-Type: application/json' \
  -d '{}'
```
