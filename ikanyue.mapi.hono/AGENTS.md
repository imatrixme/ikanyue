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

# Hono API Guard

本目录是看乐业务 API，所有客户端（小程序、Admin、官网）经由这里访问 PocketBase。根级规则见上层 `AGENTS.md`、`GEB.MD`、`DAO.MD`；架构参考见本目录 `CLAUDE.md`。

## Verification

- `pnpm lint`（含 `verify-no-pocketbase-hooks` 守卫，零警告）。
- `TZ=Asia/Shanghai pnpm test`；只改某一领域时可先跑对应子集，如 `pnpm commerce:test`。
- `pnpm check-docs`：它只报告不失败，用来确认本次触及的 `*.js.md` 不缺 mermaid、未落后于代码。
- 需要 PocketBase 的集成测试（`*:test:pocketbase*`）只在真实本地库可用时运行，并说明环境。

## Docs

- 修改已有 `*.js.md` 的 `.js` 时，同步更新该 `.md`（含 mermaid 流程图）与相邻的 `*.swagger.json`。
- 新增的路由或横切工具（如 `src/utils/*`）配一份 `*.js.md`；`src/services/**` 领域实现以测试和 OpenSpec 为证据，不为补齐覆盖率批量新建 `*.js.md`。

## Boundaries

- 所有返回用户、学员、教师记录的响应经 `src/utils/publicUser.js` 脱敏；拼 PocketBase filter 的用户输入经 `filterLiteral()` 或 SDK 参数化转义。
- 不在 PocketBase 中写业务 hook（`pb_hooks`）；业务逻辑留在 `src/services`，schema 变更走 `pocketbase/pb_migrations` 版本化迁移。
- 支付只通过 `src/services/commerce/gatewayClient.js` 与 `kanyue.pay` 交互；不在本服务保存支付渠道凭据。
- Ops（Admin）令牌带 `scope: ops`，与小程序令牌隔离；不放宽 `src/middleware/opsAuth.js` 的作用域校验。
