# kanyue

看乐项目 monorepo。根仓库使用 Git submodule 管理各子项目入口，各子项目继续保持独立仓库、独立依赖、独立锁文件和独立发布节奏。

## Projects

| Path | Description | Runtime |
| --- | --- | --- |
| `ikanyue.taro3` | 微信小程序 | Taro 3 / Vue |
| `ikanyue.mapi.hono` | 后端 API | Hono / Node.js or Bun |
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

四个子项目都作为 submodule 注册在根仓库中。根仓库记录的是每个子模块的远端地址、跟踪分支和当前 commit 指针。

| Path | Remote | Branch |
| --- | --- | --- |
| `ikanyue.taro3` | `git@github.com:imatrixme/ikanyue.taro3.git` | `2604/jieshao` |
| `ikanyue.mapi.hono` | `git@github.com:imatrixme/ikanyue.mapi.hono.git` | `master` |
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
