## Why

当前小程序首个 tab 和页面标题仍以“活动”命名，且左侧“一周后”“已结束”仍沿用活动筛选逻辑，和现在希望承载的首页信息入口不一致。需要把该页面调整为“首页”入口，并让“学什么”“关于看乐”直接进入图片详情说明页，减少用户理解成本。

## What Changes

- 将 tabBar 首个入口文案从“活动”改为“首页”，并将对应页面标题同步改为“首页”。
- 将首页左侧分组中的“一周后”改为“学什么”，“已结束”改为“关于看乐”。
- 为“学什么”“关于看乐”增加跳转行为，点击后进入新的图片详情页，并通过参数传入图片 URL。
- 图片详情页分别使用 `https://kyoss.abcmem.com/ikanyue-public/zai-kanyue-xue-shenme.JPG` 与 `https://kyoss.abcmem.com/ikanyue-public/guanyu-kanyue.JPG` 作为内容来源。
- 保持其余日期分组的活动筛选能力不变；点击“学什么”“关于看乐”时不再切换右侧活动列表内容。

## Capabilities

### New Capabilities
- `home-page-image-navigation`: 首页支持静态信息入口项，并可跳转到接收图片 URL 参数的图片详情页展示内容。

### Modified Capabilities

## Impact

- 影响页面与配置：`src/app.config.js`、`src/pages/activity/index.vue`、`src/pages/activity/index.config.js`。
- 需要新增图片详情页及其页面配置、样式和路由注册。
- 需要确认图片 URL 通过页面参数传递时的编码与展示兼容性。
