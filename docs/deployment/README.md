# 部署文档

每个服务一份，写“怎么把它放到线上、怎么升级、怎么回滚”。命令细节、备份恢复脚本与流量切换步骤以 [部署 runbook](../../.codex/skills/kanyue-deploy/references/deployment-runbook.md) 为准；本目录只写各服务自己的产物、配置、数据和发布顺序，并链接到已有说明，不重复抄写。

| 服务 | 产物 | 运行位置 | 文档 |
|---|---|---|---|
| `kanyue.server`（含内嵌运营后台 `ikanyue.admin`） | Docker 镜像，单个二进制 | `compose.yaml` 的 `server` | [server.md](server.md) |
| `kanyue.gateway` | Docker 镜像，单个二进制 | `compose.yaml` 的 `gateway`（profile `gateway`） | [gateway.md](gateway.md) |
| `kanyue.pay` | Docker 镜像，单个二进制 | `compose.pay.release.yaml` | [pay.md](pay.md) |
| `ikanyue.website` | Nuxt 构建产物 `.output/` | 仓库未定义 | [website.md](website.md) |
| `ikanyue.mini` | 小程序代码包 `miniprogram/` | 微信平台 | [miniapp.md](miniapp.md) |

## 线上拓扑

```text
小程序 ──https──> mapi.ikanyue.com ─┐
                                   ├─ OpenResty（1Panel，终止 TLS）
后台/数据/其他 API 域名 ────────────┘     │
                                         ├─> gateway 数据面 127.0.0.1:1460 ──> server
                                         ├─> server  ADMIN_PORT / API_PORT / POCKETBASE_PORT（同一进程）
                                         └─> （待定）pay 微信回调
server ──PAY_GATEWAY_URL──> pay 127.0.0.1:1340
server、pay ──心跳注册──> gateway 管理面 1461（只在回环，SSH 隧道访问）
```

- 三个 Go 服务各自内嵌 PocketBase，各有独立数据目录；任何一个的面板 `/_/` 都只走 SSH 隧道。
- 宿主机端口一律只绑定回环（`BIND_ADDR=127.0.0.1`），对外只经 OpenResty。

## 通用规则

1. **先备份再动数据**：迁移、换数据目录、切流量之前，给受影响的数据目录做带时间戳的备份，并记下恢复命令。
2. **迁移显式执行**：`kanyue-server migrate up`、`kanyue-pay migrate up`；有待执行迁移时 `serve` 拒绝启动。网关没有单独的迁移命令，`serve` 启动时自己迁移（见 [gateway.md](gateway.md)）。迁移只新增集合、字段和索引。
3. **先旁路再切流**：新镜像先在另一组端口或项目名上跑通验证，再改 OpenResty。
4. **记录回滚目标**：切流前记下旧镜像/提交、旧 compose 项目、备份路径。
5. **回滚从轻到重**：OpenResty 指回旧服务 → 重启旧 compose 项目 → 用记录的镜像重建 → 最后才是恢复数据（会丢失备份之后的写入，需要明确同意）。
6. **不把本地数据带上线**：`seed local` 在 `NODE_ENV=production` 下拒绝执行；`.local/native` 只用于本地。

## 发布顺序

一次跨服务的发布按依赖从下往上：

1. `kanyue.pay`（只有支付改动时）：备份 → 迁移 → 换镜像。
2. `kanyue.server`：备份 → 迁移 → 旁路验证 → 切流。
3. `kanyue.gateway`：小程序新增或删除接口时，在 server 上线后执行 `exposure apply mapi` 并依次上线到 TEST、PRE、RELEASE；网关本身升级用零停机脚本。
4. `ikanyue.website`：依赖的公开接口已在线上后再发布。
5. 小程序：server 和网关都上线后再提交审核、发布。

## 本地联调不是部署

`node scripts/native-stack.mjs` 只用于本机：编译到 `.local/native/bin` 后直接运行，数据在 `.local/native`，不碰 Docker 卷，见根目录 [README](../../README.md#unified-environment-startup)。
