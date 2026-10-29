# kanyue.pay 部署

独立支付网关，单个二进制 `kanyue-pay`，内嵌自己的 PocketBase（`pay_entities`）。接口契约与上线门禁见 [kanyue.pay/README.md](../../kanyue.pay/README.md)，所有权划分见 [支付架构决策](../architecture/payment-gateway.md)。

> **真实收款尚未开通，也没有验收过。** 商户权限、公网回调、真机收银、次日账单等验收完成前，不要把 `PAY_LIVE_ENABLED` 设为 `true`。生产环境不允许 mock 渠道。

## 产物与端口

- 发布模板 `compose.pay.release.yaml`，服务名是 `gateway`（指支付网关，与 API 网关 `kanyue.gateway` 无关）。
- `PAY_IMAGE` 必须是不可变的镜像标签或 digest；模板里的 `build` 只用于本地构建。
- 容器监听 `1340`，宿主机只发布在 `127.0.0.1:${PAY_RELEASE_PORT:-1340}`。
- 健康检查：`/health`（存活）、`/ready`（存储可用）。
- 面板 `/_/` 只读，经 SSH 隧道查看；PocketBase SQL 控制台已关闭（403）。

## 配置

| 变量 | 说明 |
|---|---|
| `PAY_DATA_SOURCE` | 已备份的支付数据目录绝对路径 |
| `PAY_CREDENTIALS_DIR` | 只读挂载的凭据目录，内含 `wechat.json` |
| `PAY_PROVIDER` | 生产只能是 `wechatpay` |
| `PAY_LIVE_ENABLED` | 默认 `false`；真实收款上线门禁之一 |
| `PAY_RELEASE_APPROVAL` | 真实收款需 `merchant-live-acceptance-approved` |
| `PAY_SERVICE_TOKEN` | server 调用支付网关的令牌，至少 32 字符，与 server 的同名变量一致 |
| `PAY_EVENT_URL` / `PAY_EVENT_TOKEN` | 支付结果推送到 server 的 `/internal/commerce/payment-events`；不设时 server 靠拉取恢复 |

server 侧配合：`COURSE_COMMERCE_ENABLED=true`、`PAY_GATEWAY_URL`、`PAY_SERVICE_TOKEN`、`PAY_EVENT_TOKEN`。

## 首次上线

1. 准备数据目录与只读凭据目录；建面板超管（备份命令也要用它）：
   ```bash
   docker compose -f compose.pay.release.yaml run --rm gateway kanyue-pay superuser upsert <邮箱> <密码> --dir=/pb_data
   ```
2. 迁移：
   ```bash
   docker compose -f compose.pay.release.yaml run --rm gateway kanyue-pay migrate up --dir=/pb_data
   ```
3. 启动：`docker compose -f compose.pay.release.yaml up -d`，检查 `curl -fsS http://127.0.0.1:1340/ready`。
4. 打通 server → pay（见下文“待确认”），在 server 上开启在线购买并重启 server。
5. 真实收款前执行 `kanyue-pay maintenance preflight`（检查凭据、镜像 digest、干净的工作区、最近的备份报告和各项验收声明）。它不构建镜像、不切流量、不扣钱。

## 升级

1. 备份（见下文），记下当前 `PAY_IMAGE`；
2. 构建并推送新镜像，更新 `PAY_IMAGE`；
3. 执行 `migrate up`（无迁移时输出 `No pending migrations.`）；
4. `docker compose -f compose.pay.release.yaml up -d`，检查 `/ready`；
5. 本地或旁路环境先跑 `node scripts/commerce-smoke.mjs --tiered`（购买、分时点退款、失败重试、网关重启）。

## 备份

```bash
docker run --rm --network host -e PAY_PB_URL=http://127.0.0.1:1340 -e PAY_PB_EMAIL -e PAY_PB_PASSWORD "$PAY_IMAGE" \
  kanyue-pay maintenance backup payment
docker run --rm --network host -e PB_URL=http://127.0.0.1:<POCKETBASE_PORT> -e PB_EMAIL -e PB_PASSWORD "$PAY_IMAGE" \
  kanyue-pay maintenance backup business
```

- 先 `export` 对应的邮箱和密码，命令不会打印它们。
- 经 PocketBase 备份 API 下载、解压到新的临时目录、做只读 SQLite 完整性与计数检查，并写 SHA-256 报告；不覆盖任何线上数据。
- 加 `--latest` 只校验最新一份已有备份（超过 26 小时报 `BACKUP_STALE`）。
- ZIP 与报告要另存到持久的异地存储，临时目录不算保留策略。

## 回滚

- 应用回滚：把 `PAY_IMAGE` 改回旧值再 `up -d`；资金相关的写入保留，不回滚数据库。
- 数据库回滚需要单独批准。

## 待确认

- **server 怎么连到 pay**：pay 用独立的 compose 项目，只发布在宿主机回环 `127.0.0.1:1340`；server 容器默认访问不到宿主机回环。上线前要定下 `PAY_GATEWAY_URL` 的地址（共用 Docker 网络、或宿主机网关地址加相应绑定），并在旁路环境验证。
- **注册到 API 网关**：发布模板没有传 `GATEWAY_URL` / `GATEWAY_REGISTRATION_TOKEN`，目前 pay 不会出现在网关控制台；`mapi` 也不暴露 pay 的接口。
- **微信支付回调**：`POST /callbacks/wechatpay` 需要公网 HTTPS 入口，OpenResty 的站点还没有定义。
