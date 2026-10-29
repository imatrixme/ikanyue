## Context

- `ikanyue.taro3`：Taro 4 + Vue 3（Options API）+ NutUI（只用 Button、Popup）；25 个页面、28 个组件，共 53 个 `.vue` 文件约 6600 行；纯逻辑约 2300 行（10 个 `pageLogic.js` 与 `utils/*`），都有 Vitest 单测。
- 模板已经只用小程序组件（`view`、`text`、`image`、`picker`、`rich-text`、`web-view` 等），没有 HTML 标签；改写主要是指令：`v-if` 139 处、`v-for` 44 处、`v-model` 13 处。
- Taro 接口共 24 个，全部是 `import Taro from '@tarojs/taro'` 的默认导入，没用 Taro hooks 或组件。
- `designWidth: 375`：样式里的 `px` 由 pxtransform 换成 2 倍 `rpx`。
- 构建期常量 `SERVICE_URL`、`STAGE` 由 `config/dev.js` / `prod.js` 注入。

## Goals / Non-Goals

- Goals：去掉框架运行时与打包步骤；平台调用只在 `kit/`；页面行为、路径、接口、视觉不变；逻辑测试全部保留。
- Non-Goals：见 proposal。

## Decisions

### D1. 目录与依赖方向

```text
ikanyue.mini/
  miniprogram/            开发者工具的 miniprogramRoot
    app.js app.json app.scss sitemap.json
    kit/                  唯一允许出现 wx 的目录
      host.js             唯一引用平台全局（wx、App、Page、Component、getCurrentPages）的文件；换平台只改这里和 api.js
      env.js              按 envVersion 选 API 地址与网关环境
      api.js              平台能力
      state.js            set / onField / 计算属性 / 差量比较（页面与组件共用）
      page.js             definePage
      component.js        defineComponent
      app.js              defineApp：未捕获的异步错误统一提示
    core/                 纯逻辑：不 import kit，不出现 wx
    services/             request、apis、usermanager 等，经 kit/api 发请求
    components/           自有组件（含替代 NutUI Popup 的 k-popup）；按钮是 app.scss 里的全局类 `k-button`
    pages/<name>/         index.{js,json,wxml,scss}，路径与 taro3 一致
    styles/               _tokens.scss、_brand.generated.scss
    imgs/
  tests/                  Vitest：core、services、kit（假 host）与静态检查
  package.json            只有开发依赖（vitest、eslint、sass 用于检查）
  project.config.json
```

依赖方向 `pages/components → services/core → kit → wx`，由 ESLint `no-restricted-syntax` / `no-restricted-imports` 与一个静态测试守住：`wx.` 只出现在 `kit/`，`core/` 不 import `kit/`。

### D2. `kit/api.js`

| 组 | 函数 | 说明 |
|---|---|---|
| `nav` | `to(url, query)`、`redirect(url, query)`、`tab(url)`、`back(delta)`、`relaunch(url)` | 统一编码 query |
| `ui` | `toast(text, { kind, duration })`、`confirm({ title, content, okText, okColor, cancelText, showCancel })`、`loading(text)` | `confirm` 返回布尔；`loading` 返回关闭函数 |
| `storage` | `get`、`set`、`remove` | 同步，读不到返回 `undefined` |
| 请求 | `request({ url, method, data, headers, timeout })` | 返回 `{ status, data, headers }`；网络失败抛 `{ code: 'NETWORK' }` |
| `auth` | `login()` | 返回 `code` |
| 支付 | `pay(params)` | 返回 `'paid'` 或 `'cancelled'`，其他失败才抛 |
| `notify` | `subscribe(templateIds)` | 返回 `{ [id]: accepted }`（拒绝是 `false`，不是错误）；调用失败抛 `SUBSCRIBE`；平台不支持时返回空对象 |
| `page` | `title(text)`、`stopRefresh()`、`guardLeave(message)`、`unguardLeave()`、`setTabItem({ index, text, iconPath, selectedIconPath })` | |
| `system` | `call(phone)`、`previewImage(urls, current)`、`currentPages()` | `currentPages` 返回路由数组；拨号取消静默 |

规则：不透传平台原始返回对象；用户取消不是错误；错误统一为带 `code`、`message` 的 `Error`。

### D3. `definePage` / `defineComponent`

```js
definePage({
  data: () => ({ courses: [], loading: true }),
  computed: { empty: (s) => !s.loading && s.courses.length === 0 },
  async onLoad(query) { await this.refresh(); },
  onPullDownRefresh() { return this.refresh(); },
  methods: { async refresh() { return this.set({ courses: await load(), loading: false }); } },
});
```

- 读数据用原生 `this.data`（不再引入 `state` 概念）；`this.set(patch)` 合并、重算全部计算属性、逐字段比较（引用相等，或一层浅比较相等），只把变化字段交给 `setData`，返回 Promise（视图更新后结束）。数组与对象整体替换，不原地修改。`undefined` 以 `null` 传给视图。
- 计算属性是 `(data) => value` 纯函数；页面初次渲染前在 `data` 里就算好，避免闪烁。
- `methods` 平铺到 Page 实例；内置 `onField(e)`：`data-field` 指定字段（允许一层嵌套，如 `form.name`，整体替换外层对象），写入 `data-value` 或 `e.detail.value`，替代 `v-model`。
- `onLoad(query)` 收到已解码的参数（平台按 URL 原样传入），页面不再自行 `decodeURIComponent`。
- 生命周期原样转发；`onPullDownRefresh` 返回的 Promise 结束后自动 `stopRefresh`。
- 未捕获的异步错误：生命周期与事件处理返回的 Promise 被框架忽略，拒绝后进入 `App.onUnhandledRejection`，由 `defineApp` 统一提示——带 `code` 的错误显示其 `message`，其他错误显示通用文案并打印日志。方法互相调用时错误照常向上抛，调用方可自行 `catch`。
- `defineComponent`：`props` → `properties`；监听全部属性（`observers['a, b']`）在变化后重算计算属性；`this.emit(name, detail)` → `triggerEvent`；默认 `multipleSlots`、`styleIsolation: 'shared'`、`virtualHost: true`（与 Taro 下无宿主节点、全局 BEM 样式一致），可覆盖；使用原生 slot。
- 父级给组件加类名用 `ext-class` 属性（虚拟宿主上 `class` 不生效）；列表行用 `item-id` 属性，组件在事件 `detail.id` 里带回，不依赖组件节点上的 `data-*`。
- 需要被父级刷新的容器组件（`upcoming-lessons`、`teacher-booking-home`、`teacher-calendar-home`）关闭 `virtualHost`，父级用 `this.selectComponent('#id').refresh(force)` 替代 `$refs`。
- `page-chrome`、`sticky-action-bar` 原是只包一层的组件，改为 app.scss 全局类，少一层组件。

不做依赖追踪：页面数据小，全量重算纯函数的成本可以忽略，换来没有隐藏行为、可直接单测。

### D4. 运行环境

`kit/env.js` 读 `wx.getAccountInfoSync().miniProgram.envVersion`：

- `develop` → `http://127.0.0.1:1437`，`X-Ca-Stage: TEST`（与 native-stack 一致）；
- `trial`、`release` → `https://mapi.ikanyue.com`，`X-Ca-Stage: RELEASE`。

不再有构建期常量，开发包与正式包是同一份代码。真机调试开发版时 `127.0.0.1` 指向手机本身：仅在 `develop` 下读取本地存储 `kit.devApiUrl` 覆盖地址（在调试器控制台 `wx.setStorageSync('kit.devApiUrl', 'http://<局域网 IP>:1437')`），取代原来的 `KANYUE_LOCAL_API_URL`。

### D5. 样式与设计 token

- 开发者工具 `useCompilerPlugins: ["sass"]` 编译 `.scss`；不引入打包工具。
- 尺寸改写为 `rpx`（`px × 2`，与 pxtransform 一致）；`1px` 发丝线、媒体查询断点（rpx 在 `@media` 中无效）与行内图标尺寸保留 `px`。
- `scripts/sync-design-tokens.mjs` 为 `ikanyue.mini` 生成 rpx 版本的 `_brand.generated.scss` 与 `theme.js`；页面 `.json` 里的颜色写字面量，由 `scripts/check-design-system.mjs` 校验与 token 一致。

### D6. 模板写法（为将来转换其他平台）

只用 `wx:if / wx:elif / wx:else / wx:for / wx:key`、`bind*` / `catchtap`（值只写方法名）、原生节点上的 `data-*`、`{{}}`；`{{}}` 里不调函数、不用模板字符串和 `?.`，需要的展示值在计算属性里算好；自定义组件的布尔属性写 `="{{true}}"`。不用 WXS 与微信独有组件；需要时包成自有组件。以上由 `tests/views.test.js` 静态检查。转换脚本等真正接入第二个平台时再写。

### D7. 测试与守卫

- `core/`、`services/` 的现有 Vitest 单测随代码迁移；`kit/` 用假 `host` 测 `set` 的差量、取消语义、下拉刷新、错误提示。
- 原 `tests/e2e` 对构建产物的检查改为对源码的静态检查（`tests/source.test.js`）：页面与 tabBar 清单、页面窗口配置、不含凭据与测试端点、运行时不打日志、样式只用 token、学员课程与约课边界；逐字文案快照不再保留。
- `scripts/gateway-exposure.test.mjs` 改为扫描 `ikanyue.mini/miniprogram/services`。

## Migration Plan

1. 建项目骨架与 `kit/`（含测试与守卫）。
2. 搬 `core/`、`services/`，跑通原有单测。
3. 自有基础组件与样式 token；再按 首页 → 约课 → 我的 → 其余页面 的顺序改写，教师端随对应页面一起。
4. 全量静态检查、单测、开发者工具编译与真机回归（学员、教师、模拟支付、订阅）。
5. 切换：根脚本与文档指向 `ikanyue.mini`，更新既有 spec，上传体验版验收；确认后删除 `ikanyue.taro3`。

回滚：切换前旧项目不动；上线后问题可在公众平台回退版本，或从 `ikanyue.taro3` 的最后提交重新上传。

## Risks / Trade-offs

- 53 个文件重写带来回归风险 → 逻辑由单测保住，界面逐页对照旧版截图与真机回归。
- 失去 H5 预览 → 截图验证改用开发者工具。
- 迁移期两套代码 → 一次做完，期间旧项目只修阻塞问题。
