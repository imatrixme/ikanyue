# kanyue.gateway 部署

自研 API 网关，替代阿里云 API 网关。完整说明在 [kanyue.gateway/README.md](../../kanyue.gateway/README.md)（环境变量、部署、零停机升级、轮换密钥、目标机器验证）；这里只列上线和升级的顺序。

## 产物与端口

- 镜像 `kanyue-gateway:local`，由 `compose.yaml` 的 `gateway` 构建（Dockerfile 先构建 `console/` 控制台再嵌进二进制）。服务在 profile `gateway` 下，不加 `--profile gateway` 不会启动。
- 数据面 `GATEWAY_PORT`（默认 `1460`）：OpenResty 把 API 域名反代到这里。
- 管理面与控制台 `1461`：宿主机只发布在 `127.0.0.1`，不配任何 OpenResty 站点，用 `ssh -L 1461:127.0.0.1:1461 <host>` 后打开 `http://127.0.0.1:1461/console/`。
- `gateway-standby`（`1470`/`1471`）只在零停机升级期间运行。
- 数据卷 `gateway_data`（`GATEWAY_DATA_SOURCE`）。网关没有单独的迁移命令，`serve` 启动时自己迁移。

## 配置

- `GATEWAY_REGISTRATION_TOKEN`：至少 32 字符；server（和 pay）用同一个值注册。
- `GATEWAY_ENCRYPTION_KEY`：32 字符；加密插件密钥、AppSecret、TOTP 种子等。**丢了就解不开这些数据和用旧密钥做的备份**，与备份分开保管。
- `GATEWAY_TRUSTED_PROXIES`：compose 默认含 Docker 网段 `172.16.0.0/12`，OpenResty 在宿主机上时不用改。
- `GATEWAY_RELEASE_APPROVAL=1`：上线到 RELEASE 需要另一身份批准。
- 其余见 README“环境变量”。

## 首次上线（切换阿里云网关）

1. 备份 `gateway_data`（首次为空可跳过），启动：`docker compose --profile gateway up -d gateway`，`curl -fsS http://127.0.0.1:1461/api/health`。
2. 绑定控制台超管的验证器：
   ```bash
   docker compose --profile gateway exec gateway \
     kanyue-gateway totp enroll <超管邮箱> --dir=/pb_data --encryptionEnv=GATEWAY_ENCRYPTION_KEY
   ```
3. 给 server 设置 `GATEWAY_URL=http://gateway:1461` 与令牌并重启，在控制台确认 `kanyue.server` 实例在线。
4. 登记小程序接口并在控制台核对后依次上线到 TEST、PRE、RELEASE：
   ```bash
   docker compose exec gateway kanyue-gateway exposure apply mapi --dir=/pb_data --encryptionEnv=GATEWAY_ENCRYPTION_KEY
   ```
   上线检查要求每个服务在 RELEASE 至少有一个健康实例；TEST/PRE 需要以 `GATEWAY_STAGE=TEST`/`PRE` 注册的实例，否则这两个环境返回 503。
5. 数据面验证：清单内的接口有响应，清单外的返回 404：
   ```bash
   curl -fsS -H 'Host: mapi.ikanyue.com' 'http://127.0.0.1:1460/v1/public/venues'
   curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: mapi.ikanyue.com' 'http://127.0.0.1:1460/ops/students'
   ```
6. 先用旁路域名指到 `127.0.0.1:1460`，跑一遍小程序和契约测试：`BASE_URL=<旁路域名> CONTRACT_STAGE=<环境> node --test "kanyue.server/contract/*.test.mjs"`（`mapi` 不暴露 `/ops/*`，那部分用例 404 是预期）。
7. 最后把 `mapi.ikanyue.com` 在 OpenResty 指到数据面（示例配置见 README“部署”）；1Panel 站点要保留 `Host` 头，证书覆盖分组绑定的每个域名。阿里云网关保留到观察期结束，作为回滚目标。

## 日常变更

- **小程序新增或删除接口**：随 server 上线后再执行第 4 步的 `exposure apply mapi`，在控制台上线；接口清单 `kanyue.gateway/internal/exposure/mapi.json` 由 `scripts/gateway-exposure.test.mjs` 与小程序调用保持一致。
- **配置变更**：在控制台改草稿再上线；回滚在控制台“发布 → 回滚”，会生成新版本，不需要恢复数据。
- **网关升级**：仓库根目录 `node scripts/gateway-rollout.mjs`（已有镜像时加 `--no-build`），先起 standby 承接流量再重建主进程。发布说明标了“不兼容的 schema 变更”或升级内嵌 PocketBase 时改用停机升级，并先备份数据目录（README“零停机升级”）。
- **轮换加密密钥**：离线命令 `rotate-key`，需要先停网关，见 README“轮换加密密钥”。

## 备份与恢复演练

- `BACKUP_CRON`、`BACKUP_S3_*` 可配置定时备份到 S3；compose 目前没有把这些变量传给 `gateway`，需要时在面板里设置或先补 compose。
- 演练：`docker compose --profile gateway exec gateway kanyue-gateway backup verify --dir=/pb_data --encryptionEnv=GATEWAY_ENCRYPTION_KEY`，最新备份超过 26 小时算失败。

## 回滚

1. OpenResty 把 API 域名指回阿里云网关或直接指到 server 的 `API_PORT`，reload；
2. 配置错误用控制台回滚；
3. 镜像问题：`gateway-standby` 仍在跑时它会继续承接流量，修好后重跑升级脚本。
