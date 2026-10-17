# Mini Program Guard

本目录是看乐微信小程序（学员与教师双身份）。根级规则见上层 `AGENTS.md`、`GEB.MD`、`DAO.MD`；架构参考见本目录 `CLAUDE.md`。

## Verification

- `pnpm lint`（ESLint，零警告）。
- `TZ=Asia/Shanghai pnpm test`（Vitest，测试与被测文件同目录 `*.test.js`）。
- `pnpm build:weapp`（会先跑 `verify-student-course-boundary`，后跑产物检查），之后 `pnpm test:e2e` 校验编译产物契约与设计 token 守卫；改动共享样式时再跑 `pnpm visual:styles`。
- 需要截图验证时：`NODE_ENV=development KANYUE_LOCAL_API_URL=http://127.0.0.1:1437 npx taro build --type h5`，验证完再 `pnpm build:weapp` 恢复 `dist/`。H5 只是预览，真实交付以 weapp 与微信开发者工具为准。

## Conventions

- 页面目录 `src/pages/<camelCase>/`：`index.vue`、`index.scss`、`index.config.js`，可选 `pageLogic.js`（纯逻辑，配单测）。共享组件放 `src/components/`（PascalCase）。
- Vue 组件使用 Options API（`export default { data, computed, methods }`），4 空格缩进、单引号；不在单个改动里混入 `<script setup>` 迁移。
- 网络请求只经根目录 `utils/request.js` 与 `utils/apis.js`；登录态与身份在 `utils/usermanager.js`、`utils/rolemanager.js`（教师底栏由 `RoleManager.applyTabBar` 切换）。
- 样式只用 `src/styles/_tokens.scss` 与 `theme.mjs` 的 token；不写裸色值和裸字号/字重/行高（e2e 守卫会拦截）。`_brand.generated.scss` 由根目录 `scripts/sync-design-tokens.mjs` 生成，不手改。
- 页面配置用 `theme.mjs` 的 `canvasPageChrome`（“我的”页用 `immersivePageChrome`）。
- 线性图标由 `assets-src/imagegen/icons-v2/*.svg` 经 `pnpm icons:generate` 生成；空状态图在 `src/imgs/empty/*-brand.png`。

## Boundaries

- 学员课程页不暴露课程点、批次、兑换等内部概念，不调用 `/v1/course-credits` 管理接口；预约侧只允许 `verify-student-course-boundary.mjs` 白名单中的写操作。
- 不在前端保存或拼接支付凭据；下单、支付、退款状态以 API 返回为准。
- `dist/`、`output/` 是构建产物，不提交、不手改。
- 包管理器是 pnpm（`packageManager: pnpm@10.19.0`，Dockerfile 用 `pnpm install --frozen-lockfile`）；只维护 `pnpm-lock.yaml`。
- 提交信息沿用 `type: 中文摘要`；用户可见变化附截图或说明在微信开发者工具中的验证情况。
