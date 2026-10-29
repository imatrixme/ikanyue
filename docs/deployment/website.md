# ikanyue.website 部署

声乐官网与公开课程目录，Nuxt 4。仓库里**没有**它的 Dockerfile、compose 服务或托管配置，线上在哪里运行需要确认；下面只写从代码能确定的部分。

## 构建

```bash
cd ikanyue.website
npm ci
npm run lint && npm test && npm run build
```

产物在 `.output/`：

- `.output/server/index.mjs` 是 Node 服务（Nitro 默认 `node-server` 预设），`.output/public/` 是静态资源和预渲染页面。
- 运行：`PORT=3000 HOST=127.0.0.1 node .output/server/index.mjs`，再由 OpenResty 反代官网域名。

有服务端渲染，所以不能只放静态文件。只有 `/faculty`、`/stories`、`/about`、`/contact`、`/privacy`、`/sitemap.xml`、`/robots.txt` 是构建时预渲染的。首页、课程、课包、活动页按 `swr: 300` 缓存 5 分钟（`config/route-rules.ts`），所以 server 上改了课程，官网最多 5 分钟后才更新。

## 配置

运行时环境变量（`nuxt.config.ts`）：

| 变量 | 本地默认 | 说明 |
|---|---|---|
| `NUXT_PUBLIC_API_BASE` | `http://127.0.0.1:1437` | 业务 API 地址；服务端渲染和浏览器都会用它 |
| `NUXT_PUBLIC_SITE_URL` | `http://127.0.0.1:3000` | 官网自己的公开地址，用于站点地图、`robots.txt` 和首页结构化数据 |
| `NUXT_PUBLIC_MINI_PROGRAM_URL` | 空 | 课包“去小程序购买”的跳转链接，可含 `{packageCode}`，否则追加 `?package=<编码>`；为空时改为跳到 `/contact?package=<编码>` |

`sitemap.xml` 和 `robots.txt` 在构建时预渲染，**`NUXT_PUBLIC_SITE_URL` 必须在 `npm run build` 时就设好**，只在运行时设置不会改到这两个文件。

官网调用的接口：`GET /v1/activity/find`、`GET /v1/public/course-catalog`、`/v1/public/course-catalog/courses/{id}`、`/v1/public/course-catalog/packages/{id}`。

- **不要把 `NUXT_PUBLIC_API_BASE` 指向 `mapi.ikanyue.com`**：经网关时 `mapi` 只暴露小程序调用的接口，课程目录会返回 404。
- 目前应指向直连 server 的 API 域名（`xapi.ikanyue.com`）。以后这个域名也接入网关时，需要先给官网登记一个分组。
- 跨域访问（官网域名访问 API 域名）上线前要在浏览器里实际验证。

## 发布

1. 确认依赖的公开接口已在线上 server。
2. 在构建机执行上面的检查和构建（`npm run test:e2e` 可选，需要浏览器）。
3. 把 `.output/` 整个目录换到运行位置并重启 Node 进程；保留上一版 `.output/`，用于回滚。
4. 验证：首页、`/courses`、任意课程详情和课包页能打开且数据正确；`/sitemap.xml` 里的地址都以 `NUXT_PUBLIC_SITE_URL` 开头。

## 回滚

换回上一版 `.output/` 并重启。官网不保存数据，回滚没有数据风险。

## 待确认

- 托管方式（同机 Node 进程、1Panel 运行环境，或其他平台）与官网域名；确定后在这里补上进程管理和 OpenResty 站点配置。
