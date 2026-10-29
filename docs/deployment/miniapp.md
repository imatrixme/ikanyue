# 小程序（ikanyue.mini）部署

学员与教师共用的微信小程序，原生小程序 + 自有薄封装 `kit/`。没有构建步骤：`miniprogram/` 目录就是代码包，Sass 由微信开发者工具编译。用开发者工具上传，在微信公众平台提交审核并发布。仓库里没有 `miniprogram-ci` 自动上传。

## 检查

```bash
cd ikanyue.mini
pnpm install --frozen-lockfile
pnpm lint
TZ=Asia/Shanghai pnpm test   # 单元测试 + 模板、源码边界、契约静态检查
```

在仓库根目录：

```bash
node scripts/check-design-system.mjs              # 生成的 token 未过期、样式和页面 JSON 只用 token
node --test scripts/gateway-exposure.test.mjs     # 小程序接口与网关清单 mapi.json 一致
```

本地联调（`node scripts/native-stack.mjs up` 后，网关 `mapi` 分组已上线到 TEST）：`pnpm test:live` 用真实页面代码、经网关 `mapi.ikanyue.com` + TEST 跑学员与教师主流程（密码登录、约课、确认/拒绝/撤回/取消、模拟付款与退款、各页只读加载），账号从环境变量 `LIVE_STUDENT_CELLPHONE`/`LIVE_STUDENT_PASSWORD`/`LIVE_TEACHER_CELLPHONE`/`LIVE_TEACHER_PASSWORD` 读取。它会在本地数据里留下预约与模拟订单；不替代真机上的渲染、微信手机号登录、收银台与订阅弹窗。

## 环境

接口地址不随构建切换，运行时按版本类型（`envVersion`）决定，见 `miniprogram/kit/env.js`：

- 开发版：本地 server `http://127.0.0.1:1437`，`X-Ca-Stage: TEST`；真机调试可在本地存储 `kit.devApiUrl` 写局域网地址。
- 体验版、正式版：`https://mapi.ikanyue.com`，`X-Ca-Stage: RELEASE`，网关按它选环境。

所以上传的代码包和本地调试的是同一份源码，不存在“误传 watcher 产物”的问题；但体验版已经连生产环境，验收时注意数据是真实的。

## 上传与发布

1. 微信开发者工具打开 `ikanyue.mini` 目录（`miniprogramRoot` 是 `miniprogram/`），确认 AppID 是正式小程序，编译无报错，并记录“代码依赖分析”里的包体积。
2. 真机预览走一遍：登录、首页、约课、我的，学员和教师身份各一遍；改到支付或续费提醒时，把对应流程也走一遍。
3. 上传，版本号和备注写清本次改动。
4. 微信公众平台：设为体验版，验收后提交审核，审核通过再发布。

## 上线前提

- 小程序新调用的接口已随 server 上线，并已登记到网关清单 `mapi.json`、上线到 RELEASE（见 [gateway.md](gateway.md#日常变更)）。没上线的接口经网关返回 404。
- 公众平台“服务器域名”的 request 合法域名里有 `https://mapi.ikanyue.com`。代码目前不调用 `uploadFile`/`downloadFile`，不需要配置这两类域名。
- 续费提醒的订阅消息：在公众平台选好模板，把模板 ID 和字段映射配到 server（`WECHAT_RENEWAL_TEMPLATE_ID`、`WECHAT_RENEWAL_TEMPLATE_DATA`）。小程序从接口拿模板 ID，没配置时不显示订阅入口，不需要重新发版。

## 回滚

公众平台“版本管理”可以回退到上一个线上版本，只能回退一次；之后要回到更早的版本需要重新上传并审核。接口层面的兼容由 server 和网关保证：新版 server 要能服务仍在用户手机上的旧版小程序。
