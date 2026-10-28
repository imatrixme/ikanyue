## Context

网关是单个 Go 进程，内嵌 PocketBase（SQLite，WAL）。数据面配置按环境存在 `stage_versions`，启动时加载并写最近可用快照文件；实例变化由本进程的钩子触发重建。部署形态是宿主机 1Panel OpenResty → Docker 里的网关（compose `gateway` profile）。密钥字段以 `enc:v1:` 前缀密文存储，环境版本、上线记录、快照文件里存的也是密文，编译快照时才解密；PocketBase 设置同样用该密钥加密。

## Decisions

### D1. 零停机升级用“主备轮流”，不做进程内交接

- 方案对比：
  - `SO_REUSEPORT` + 进程交接：单命令，但 Docker 桥接网络下新旧容器不在同一网络命名空间，用不上；
  - 主备轮流 + OpenResty `backup`：与 compose 部署天然契合，只多一个 compose 服务和一段 upstream 配置。选它。
- OpenResty：`upstream { server 127.0.0.1:1460 max_fails=1 fail_timeout=2s; server 127.0.0.1:1470 backup; keepalive 64; }`，`proxy_next_upstream error timeout;`。连接被拒时请求尚未发出，nginx 对 POST 也会转到备用实例。
- 流程（`scripts/gateway-rollout.mjs`）：构建镜像 → 启动 `gateway-standby`（新镜像）→ 等其管理面健康 → 重建 `gateway`（旧进程收到 SIGTERM 排空 10 秒，期间新连接被拒并转到备用）→ 等健康 → 停 `gateway-standby`。
- 管理面健康即数据面就绪：`OnServe` 里数据面先开始监听、再放行管理面。
- 停止宽限期 30 秒，大于排空时间 10 秒。

### D2. 重叠的进程自行收敛

- 每个进程每 5 秒检查一次：各环境最新 `stage_versions` 版本号与可路由实例指纹（服务、环境、地址、权重排序后拼接；只更新心跳时间不改变指纹）。
- 版本号比本进程新就重新加载该环境；指纹变了就重建实例表。
- 代价是每 5 秒两条小查询；收益是不依赖“升级时不上线”的约定，也为将来多实例打底。
- 重叠窗口内告警可能被两个进程各评估一次，可能重复通知；窗口只有几十秒，接受并写入文档。分钟指标按主键合并，两个进程写同一分钟会累加，不丢数。

### D3. 密钥轮换是离线命令

- `kanyue-gateway rotate-key --dir=… --encryptionEnv=<旧密钥变量> --newKeyEnv=<新密钥变量>`。
- 运行中的 `serve` 对数据目录下的 `gateway.lock` 持共享锁（主备可同时持有）；`rotate-key` 要求独占锁，拿不到就拒绝。
- 步骤：
  1. 备份（PocketBase 备份 `pre-rotate-key-*.zip`）；
  2. 扫描所有集合的文本与 JSON 字段，找出 `enc:v1:` 密文，先全部用旧密钥解开，任何一个失败就中止、不写入；
  3. 一个事务里用新密钥重新加密并以原始 SQL 写回（绕过只追加集合的钩子，审计里记一条轮换记录，不含密文）；
  4. 用新密钥保存 PocketBase 设置；
  5. 提交后改写最近可用快照文件，并用新密钥逐个环境编译校验。
- 轮换前的备份仍只能用旧密钥解开；旧密钥要保留到这些备份过期。

### D4. CI 只覆盖网关半径

- `.github/workflows/gateway.yml`，按路径触发：`kanyue.gateway/**`、`scripts/gateway-*`、`ikanyue.taro3/utils/**`（暴露清单测试的输入）。
- Go 用 `go.mod` 的版本；控制台用 Node 22；`govulncheck` 失败即阻断。
- `govulncheck` 只看可达漏洞；`kanyue.gateway/govulncheck-accepted.txt` 逐条登记接受的编号和理由，清单外的可达漏洞阻断，已修复却仍在清单里的给出警告。
- 首次扫描（2026-10-28）：x/net、x/image、x/text 与 Go 工具链（`toolchain go1.26.10`）直接升级；剩余两条在 PocketBase（GO-2026-5548 OAuth2 自动关联，网关不用 OAuth2；GO-2026-6489 batch/realtime 协程 panic，管理面只在回环地址）。升级 PocketBase 会在数据目录上跑系统迁移，作为单独的变更处理（7.4）。
- 其他子项目的 CI 不在本变更范围。

### D5. 机器令牌与角色（P1）

- 新集合 `admin_tokens`：名称、角色、可上线环境、过期时间、最后使用时间；令牌只显示一次，库里存哈希。
- 角色：`viewer` 只读；`releaser` 可上线到授权环境；`admin` 全部。超管视为 `admin`。
- 上线 `RELEASE` 可配置为需要第二个身份批准；批准与上线都进审计。
- 令牌只用于 `/gateway/v1`，不进 PocketBase 数据集合；只有登录的超管能签发令牌，泄露的令牌不能自我扩散。
- 只记录令牌的变更与被拒请求进审计，读请求只更新最近使用时间（按分钟），避免看板轮询刷满审计。
- 批准开关是环境变量 `GATEWAY_RELEASE_APPROVAL`，不放在可被令牌修改的数据里。
- 申请保存所选对象解析后定义的摘要；批准时重新解析，摘要不同即作废，保证“审的就是上的”。下线、回滚不经批准。

### D6. 配置即代码（P1）

- `kanyue-gateway config export|apply <file>`：分组、域名、API（以 `METHOD /path` 引用接口）、策略组、授权，不含密钥（密钥按名称引用）。
- `apply` 只改草稿，输出差异，不上线；控制台提供环境之间的整体比对。
- 文件是草稿的全集：文件里没有的分组、API、域名、授权、策略组会被删除（平台基线除外）；名称即身份，改名等于删除再新建。
- 应用（含 AppSecret）不进文件；授权引用的应用不存在则整体失败。
- `--dry-run` 在同一事务里执行全部校验后回滚，差异与真实应用一致。

## Risks / Trade-offs

- 主备共用 SQLite：WAL 下多进程安全，但带破坏性 schema 变更的升级在重叠期间可能让旧进程出错；这类升级在说明里标注，按停机升级处理。
- 只在开发机验证了网关侧（排空、就绪、收敛）；OpenResty 的转移行为要在目标机器上按脚本实测一次。
- 轮换命令改写只追加的集合，绕过钩子是有意为之，靠事务、备份和事后校验兜底。
