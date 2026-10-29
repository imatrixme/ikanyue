# kanyue.server 部署

业务单体：API、内嵌 PocketBase、内嵌运营后台（`ikanyue.admin` 的静态 SPA）。线上只有这一个业务容器。

## 产物

- 镜像由 `compose.yaml` 的 `server` 构建：上下文 `kanyue.server`，命名构建上下文 `console=ikanyue.admin`。Dockerfile 先构建后台，再把它嵌进二进制 `kanyue-server`。
- 运营后台没有单独的容器、Nginx 或部署步骤，跟着 server 镜像一起发布。本地用 `npm run build:server` 只是为了 native-stack。
- 镜像不会自动迁移：`CMD` 只执行 `serve`。

## 端口与域名

容器内监听 `8090`，宿主机发布三个端口，进入同一个进程：

| 变量 | 默认 | OpenResty 反代的域名 |
|---|---|---|
| `ADMIN_PORT` | `8080` | 后台域名（同源 `/ops`） |
| `API_PORT` | `1337` | API 域名（`xapi.ikanyue.com`；切到网关前也包括 `mapi.ikanyue.com`） |
| `POCKETBASE_PORT` | `8090` | 数据域名 `data.ikanyue.com`（公开文件 `/api/files`） |

- `BIND_ADDR` 必须是 `127.0.0.1`（`kanyue-stack.sh prod` 会检查）。
- PocketBase REST 与面板 `/_/` 只响应不带反代头的直连：`ssh -L 8090:127.0.0.1:<POCKETBASE_PORT> <host>` 后打开 `http://127.0.0.1:8090/_/`。
- 健康检查：`GET /api/health`。

## 配置（`.env.deploy`）

从 `.env.deploy.example` 复制，逐项说明在该文件注释里。上线前必须确认：

- `JWT_SECRET`：至少 32 位随机字符，缺了服务拒绝启动；更换会让所有登录失效。
- `PB_EMAIL` / `PB_PASSWORD`：不能是默认值，密码至少 12 位。容器每次启动都会用它们 `superuser upsert`。
- `PB_DATA_SOURCE`：线上数据目录的绝对路径。
- `PB_PUBLIC_URL`：必须是 `https://`；`PUBLIC_ASSET_BASE_URL` 与 MinIO 公开读路径一致。
- `WECHAT_APPID` / `WECHAT_SECRET`：生产必填。
- 课时开关 `COURSE_CREDIT_*_ENABLED`：必须显式写 `true` 或 `false`。
- 可选：
  - 在线购买：`COURSE_COMMERCE_ENABLED=true` 加 `PAY_GATEWAY_URL`、`PAY_SERVICE_TOKEN`、`PAY_EVENT_TOKEN`，见 [pay.md](pay.md)；
  - 续费提醒订阅消息：`WECHAT_RENEWAL_TEMPLATE_ID`、`WECHAT_RENEWAL_TEMPLATE_DATA`、`WECHAT_MINIPROGRAM_STATE`，模板 ID 留空时每次投递记为 `skipped`，站内提醒照常；
  - 课时事件 webhook：`COURSE_CREDIT_OUTBOX_WEBHOOK_URL` 与 `_SECRET` 同时设置或都不设；
  - 网关注册：`GATEWAY_URL=http://gateway:1461`、`GATEWAY_REGISTRATION_TOKEN`，见 [gateway.md](gateway.md)。
- S3 凭据只在 PocketBase 面板的存储设置里维护，不进 `.env.deploy`。

> 二进制支持 `BACKUP_CRON`、`BACKUP_KEEP`、`BACKUP_S3_*`，但 `compose.yaml` 目前没有把它们传给 `server`，写进 `.env.deploy` 不会生效；定时备份暂时以 PocketBase 面板设置为准。

## 发布步骤

命令全文见 [runbook](../../.codex/skills/kanyue-deploy/references/deployment-runbook.md)。

1. **记录现状**：当前提交、compose 项目、容器镜像与端口、OpenResty 配置能通过 `openresty -t`。
2. **备份**：
   ```bash
   ./.codex/skills/kanyue-deploy/scripts/backup_pb_data.sh --source <PB_DATA_SOURCE> --backup-dir <备份目录> --label pre_deploy
   ```
   或用 `kanyue-pay maintenance backup business`（经 PocketBase 备份 API 下载并校验完整性，见 [pay.md](pay.md#备份)）。
3. **构建镜像**：1Panel 导入 `compose.yaml` 构建，或 `docker compose --env-file .env.deploy -p kanyue_prod build server`。`kanyue-stack.sh prod up` 带 `--no-build`，不会替你构建。
4. **旁路验证**：用 `.env.bypass`（高位端口、只绑回环）和另一个项目名，在数据副本上启动，执行迁移后检查：
   ```bash
   docker compose --env-file .env.bypass -p <旁路项目> run --rm --entrypoint kanyue-server server migrate up --dir=/pb_data
   ./.codex/skills/kanyue-deploy/scripts/verify_stack.sh --server http://127.0.0.1:<旁路 API 端口>
   BASE_URL=http://127.0.0.1:<旁路 API 端口> node --test "kanyue.server/contract/*.test.mjs"
   ```
5. **线上迁移**：
   ```bash
   docker compose --env-file .env.deploy -p kanyue_prod run --rm --entrypoint kanyue-server server migrate up --dir=/pb_data
   ```
   再跑一次应输出 `No pending migrations.`。
6. **换容器**：`./scripts/kanyue-stack.sh prod up --confirm-production`（检查配置、启动、冒烟）。
7. **切流与观察**：只有端口变了才需要改 OpenResty；`openresty -t` 后 reload。检查 `mapi`、`xapi`、`data` 域名和图片地址（应以 `https://kyoss.abcmem.com/ikanyue-mp/` 开头）。

## 进程内定时任务

server 自带的定时任务不需要额外配置：

- 续费提醒扫描：每天上海时间 10:00（`0 2 * * *` UTC）。
- 课时事件 webhook 投递：每分钟（配置了 webhook 时）。

旁路栈跑的是线上数据副本，到点同样会扫描并对外发送：旁路配置里保持 `WECHAT_RENEWAL_TEMPLATE_ID` 与 `COURSE_CREDIT_OUTBOX_WEBHOOK_URL` 为空（`.env.bypass.example` 默认如此），验证完停掉旁路栈。

## 回滚

1. OpenResty 指回旧服务并 reload；
2. 旧 compose 项目还在就直接启动它；否则用记录的镜像重建：`rollback_compose.sh --help`；
3. 迁移只新增集合和字段，旧版本通常能在新库上运行，回滚一般不需要恢复数据；
4. 只有数据被破坏、且明确接受丢失备份之后的写入时，才按 runbook 的恢复命令还原。

## 验证清单

- `GET /api/health` 为 200；后台首页返回 SPA。
- `/v1/activity/find`、`/v1/public/course-catalog` 返回 `code=10000`。
- 后台能登录；小程序能登录（不再提示“未配置微信小程序的 APPID 或 SECRET”）。
- PocketBase 面板经 OpenResty 访问返回 404，经 SSH 隧道可以打开。
