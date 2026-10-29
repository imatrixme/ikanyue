## Why

小程序的业务逻辑不多（约 2300 行纯 JS），但 Taro 在上面又包了一层：逻辑层模拟 DOM、视图层用递归通用模板拼树，再加 Vue 运行时和 NutUI。结果是：

- 正式包 1.5 MB 里约 0.4 MB 是框架（`taro.js`、Vue、递归模板 `base.wxml`、NutUI 全量样式）；监听编译不压缩，调试包 3.9 MB，经常触发 2 MB 警告；
- 交互要经过模拟 DOM 再 `setData`，体感迟钝；
- 本地常驻一个 Taro 监听编译进程，实测约 500 MB 内存；依赖约 20 个 `@tarojs/*`、NutUI、Babel、webpack。

跨端能力实际没在用（只发微信）。改为原生小程序加一层几百行的自有封装，既去掉框架负担，又把平台差异收在一处，将来接入其他小程序平台时只换这一层并转换模板。

## What Changes

- 新建子项目 `ikanyue.mini`：原生微信小程序（WXML + SCSS + ES Module JS），不经打包工具，微信开发者工具直接编译（Sass 用 `useCompilerPlugins`）。
- 新增自有封装层 `kit/`（零依赖、目标 300 行以内），是唯一允许直接调用 `wx` 的地方：
  - `api`：导航、反馈、存储、请求、登录、支付、订阅、页面、系统九组能力，统一 Promise，用户取消作为正常结果；
  - `definePage` / `defineComponent`：Options 风格，计算属性是 `data` 的纯函数，`this.set()` 只把变化字段交给 `setData`，内置 `onField` 表单绑定，下拉刷新自动结束；
  - `env`：按小程序运行版本（开发版 / 体验版 / 正式版）选择 API 地址与网关环境，取代构建期常量。
- 纯逻辑与接口层从 `ikanyue.taro3` 搬入 `core/`、`services/`，单测继续用 Vitest；NutUI 的按钮与弹层换成两个自有组件。
- 25 个页面、28 个组件按原有行为逐个改写为 WXML；页面路径不变，网关暴露清单 `mapi.json` 不变。
- 切换完成后：根脚本（`native-stack`、`gateway-exposure` 测试、设计 token 同步与检查）指向 `ikanyue.mini`；native-stack 不再需要小程序监听进程；删除 `ikanyue.taro3`（单独确认）。
- **BREAKING（仓库内）**：小程序源码目录、开发命令与验证命令变化；对用户、接口与数据无影响。

## Non-goals

- 不做虚拟 DOM、Proxy 响应式、自定义模板语言、路由框架、全局状态库或插件机制。
- 本次不写其他平台的模板转换脚本，不接入支付宝 / 抖音等平台；只约定可转换的模板写法。
- 不改业务功能、接口、文案与视觉；不做分包（主包预计在 1 MB 左右，留作后续）。
- 不提供 H5 预览；截图验证改用微信开发者工具。

## Decisions (2026-10-29)

1. 用户确认：不做试点，整体迁移到自有方案。
2. 新目录 `ikanyue.mini` 与 `ikanyue.taro3` 并存到切换完成；迁移期间只修阻塞问题，不在旧项目加新功能。
3. 体验版与正式版都请求 `https://mapi.ikanyue.com` 的 `RELEASE` 环境；开发版请求本地 `http://127.0.0.1:1437`、`TEST` 环境。

## Impact

- Affected specs：新增 `miniapp-native-runtime`。切换时同步修改引用 `ikanyue.taro3` / Taro 的既有要求（`subproject-unit-test-coverage`、`miniapp-page-api-unit-coverage`、`miniapp-report-experience`）。
- Affected code：新增 `ikanyue.mini`；切换时改 `scripts/native-stack.mjs`、`scripts/gateway-exposure.test.mjs`、`scripts/sync-design-tokens.mjs`、`scripts/check-design-system.mjs`、根与子项目文档、`docs/deployment/miniapp.md`；最后删除 `ikanyue.taro3`。
- 不涉及服务端、接口、数据与部署配置。
