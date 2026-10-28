<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

<!--GEB:START-->
## GEB Protocol

`GEB.MD` 是分层工程认知协议，`DAO.MD` 是克制与自然路径的迭代哲学。改动前先读最近的 `AGENTS.md`，再读与任务相关的 `GEB.MD` / `DAO.MD` 段落和半径内的局部地图（`README.md`、`docs/architecture/*`、`MODULE.md`、`*.js.md`、OpenSpec），只在当前任务半径内渐进应用：

- 任务半径 = 本次触及的文件、直接受影响的模块/API/交互路径、解释本次改动所需的文档、证明本次改动所需的检查。
- 不做全仓库迁移；不为完整性补文档；不批量创建 `AGENTS.md` / `MODULE.md` / ADR / 文件头 / `*.js.md`。
- 单次任务最多沉淀一份新文档（模块图、ADR、局部 `AGENTS.md`、高风险文件头契约），除非改动涉及架构、安全、数据归属、构建/发布，或用户明确要求。
- 证据同时审判代码与文档：不为错误代码改文档，也不为过期文档改代码。

代码、测试、文档或架构规则不一致时报告：

DRIFT FOUND:
- Location:
- Code says:
- Docs say:
- Tests say:
- Likely source of truth:
- Risk:
- Proposed fix:

阻塞当前任务的漂移在任务半径内修复；相关但不阻塞的只报告；涉及安全、隐私、支付、鉴权、数据丢失或发布的必须明确报告并给出最小安全修复。

## Final Response Format

Every task must end with:

Changed:
- ...

GEB mode:
- no sediment / local map / drift fix / ADR / local guard

Scope:
- touched radius:
- deliberately not expanded:

Semantic impact:
- implementation / behavior / interface / dependency / architecture / security / data / build / docs / rule

Verification:
- run:
- not run:
- reason:

Docs:
- unchanged because ... / updated ...

Drift:
- none / found and fixed / found but unresolved

Residual risk:
- ...

DAO impact:
- reduced burden / hidden complexity / defaults & recovery / deliberately not added / sedimented rule
- or: none; no DAO-specific change was needed.

<!--GEB:END-->

<!--DAO:START-->
## DAO Protocol

- 少做、贴合、不强迫：先移除不必要的负担，再增加能力；偏好自然默认值、清晰路径、可恢复的错误，把复杂度往内收而不是往外漏。
- 落到代码上：更少状态、更少概念、更小的公开 API、更清晰的归属。
- 最小而完整：不扩展无关范围、不加无用配置和抽象；但需求端到端实现、必要失败态有处理、相关检查已运行或说明原因。最小但不完整是偷懒，完整但不最小是过度设计。
- 发现可避免的负担时，阻塞则在任务半径内做最小修复，不阻塞则用 `DAO DRIFT FOUND`（Location / Current burden / Natural path / Smallest fix / Deferred follow-up）报告，不顺手重设计无关区域。
- 冲突优先级：用户明确要求 > 安全/隐私/数据完整性 > 正确性 > 可访问性与可恢复性 > GEB 证据 > 公开契约兼容 > DAO 简洁 > 视觉偏好。DAO 可以简化表达，不能削弱真相、安全或完整性。
<!--DAO:END-->

<!--AST-GUIDELINES:START-->
## Skills

可用时优先使用 `full-stack-ast-explorer` 与 `ast-grep`，注意其使用场景与约束。
<!--AST-GUIDELINES:END-->

<!--VERIFY-ATTENTION:START-->
## Verification

- 只运行与改动相关的子项目检查；命令以各子项目 `package.json` 为准，涉及时间的测试一律加 `TZ=Asia/Shanghai`。
- 本轮改动引入的 lint、类型、构建错误第一时间修正；不要声称运行过未运行的测试或命令。
- 需要真实联调时用根目录 `node scripts/native-stack.mjs`（`init` 显式初始化数据，`up/down/status` 管理服务）；自己启动的服务在任务结束前停掉。

| 子项目 | 常用验证 |
|---|---|
| `ikanyue.taro3` | `pnpm lint`、`TZ=Asia/Shanghai pnpm test`、`pnpm build:weapp` 后 `pnpm test:e2e` |
| `ikanyue.admin` | `npm run lint`、`TZ=Asia/Shanghai npm test`、`npm run build:server`（产物嵌入 server） |
| `ikanyue.website` | `npm run lint`、`npm test`、`npm run build`、`npm run test:e2e` |
| `kanyue.pay` | `gofmt -l .`、`GOMAXPROCS=1 go vet -p 1 ./...`、`GOMAXPROCS=1 TZ=Asia/Shanghai go test -p 1 -parallel 1 ./...`；联调 `node scripts/commerce-smoke.mjs --tiered` |
| `kanyue.server` | `gofmt -l .`、`GOMAXPROCS=1 go vet -p 1 ./...`、`GOMAXPROCS=1 TZ=Asia/Shanghai go test -p 1 -parallel 1 ./...`；契约测试 `BASE_URL=… node --test "kanyue.server/contract/*.test.mjs"` |
| `kanyue.gateway` | `gofmt -l .`、`GOMAXPROCS=1 go vet -p 1 ./...`、`GOMAXPROCS=1 TZ=Asia/Shanghai go test -p 1 -parallel 1 ./...`；控制台在 `console/`：`npm run lint`、`npm test`、`npm run build`（产物嵌入网关）；压测 `GOMAXPROCS=1 go test -tags load -run TestLoad -v ./internal/control/` |
| 根脚本 | `node --test scripts/native-stack.test.mjs`、`node --test scripts/gateway-exposure.test.mjs`（小程序接口与网关暴露清单一致）；OpenSpec 用 `openspec validate <change> --strict` |
<!--VERIFY-ATTENTION:END-->

<!-- USER-REQUIREMENTS:START -->
## 用户与协作方式

- 先读相关代码再下结论；找根因而不是给症状打补丁；信息足够时基于合理假设直接推进，只在缺失信息会改变方案或正确性时才提问。
- 有多个合理方案且取舍重要时，先列 1–3 个方案（思路、影响范围、优缺点、风险、验证方式）；用户说“实现 / 落地 / 按方案执行”时直接实现，不再重复确认。
- 不擅自引入新任务；当前任务内的局部修复，尤其是自己引入的语法、格式、构建错误，直接修复并一句话说明。
- 质量优先级：正确性与安全（数据一致性、鉴权、金额）> 业务需求与边界 > 可维护性 > 性能 > 代码长度。遵循各子项目已有写法，遇到重复逻辑、紧耦合、脆弱设计、命名含糊、过度设计时指出并给 1–2 个重构方向。

## 语言

- 解释、讨论、总结用简体中文；代码、标识符、代码注释沿用各子项目现有语言（以英文为主）；用户可见文案用中文。
- 提交信息沿用各仓库现有习惯：`type: 中文摘要`。

## 命令行与 Git

- 破坏性或难以回滚的操作（删除文件/目录、重建数据库、`git reset --hard`、`git push --force`、改公共 API、持久化格式或数据迁移）先说明风险和更安全的替代，并确认后再执行。
- 未经要求不提交、不推送；不主动重写历史；GitHub 交互优先用 `gh`。
- 单一 Git 仓库，只用 `master`：跨子项目改动在同一次提交里完成，不再开长期功能分支。`ikanyue.flutter`、`ikanyue.m.nuxt` 是根目录被忽略的独立旧仓库，不随本仓库提交。
<!-- USER-REQUIREMENTS:END -->

## 项目地图

单一仓库，各子项目保留在原目录、各自的历史已并入；没有根 `package.json` 或 workspace，进入子项目后按其锁文件与脚本操作。详情见 `README.md`。

| Path | 角色 | 技术栈 | 局部规则 |
|---|---|---|---|
| `ikanyue.taro3` | 微信小程序（学员与教师） | Taro 4 / Vue 3 / NutUI | `ikanyue.taro3/AGENTS.md` |
| `ikanyue.admin` | 运营后台（静态 SPA，`npm run build:server` 后由 kanyue.server 同源提供） | React / Vite | — |
| `ikanyue.website` | 声乐官网与公开课程目录 | Nuxt 4 | — |
| `kanyue.pay` | 独立支付网关单体（当前仅 mock 渠道；PocketBase 面板 `/_/` 只读查看） | Go / 独立内嵌 PocketBase v0.32.0 | `kanyue.pay/README.md` |
| `kanyue.server` | 业务服务单体：学员、教师、课程点、预约、课表结算、积分、订单与支付对接；内嵌 PocketBase（面板 `/_/` 仅私网直连）与运营后台 | Go / PocketBase v0.32.0 | `openspec/changes/archive/2026-10-27-rewrite-studio-backend-in-go` |
| `kanyue.gateway` | 自研 API 网关（一期替代阿里云 API 网关）：数据面 `GATEWAY_LISTEN` 默认 `127.0.0.1:1460`，管理面与控制台 `/console/` 在 `--http=127.0.0.1:1461`（超管密码 + TOTP）；服务全量心跳注册，接口清单只登记候选、路由显式勾选才暴露；插件链、发布/回滚、日志指标告警、JSON lines 导出 | Go / 独立内嵌 PocketBase v0.32.0；控制台 React + Vite | `kanyue.gateway/README.md`、`openspec/changes/add-kanyue-gateway` |
| `ikanyue.m.nuxt`、`ikanyue.flutter` | 旧活动页与规划中的 App，不在当前版本线 | Nuxt / Flutter | — |

- 跨子项目约束见 `GEB.MD` §8“看乐系统边界”；产品与架构文档在 `docs/product`、`docs/architecture`；需求级变更在 `openspec/changes`。
- `design-system/brand-tokens.json` 是品牌 token 来源；`node scripts/sync-design-tokens.mjs` 生成小程序、官网等的 `*brand.generated.*`，`node scripts/check-design-system.mjs` 校验。不手改生成文件。
- `virtual-pet`、`ikanyue.posters`、`output`、`design-output`、`backups` 不属于产品运行链路，除非任务明确涉及，不读不改。
