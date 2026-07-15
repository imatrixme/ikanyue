---
name: project-config
description: >-
  通过读写微信小程序项目根目录的 project.config.json / project.private.config.json
  查看与修改项目配置（本地设置、编译开关、目录与打包选项等）。
  不调用 wechatide 工具。在用户要改合法域名校验、热重载、ES6/增强编译、上传压缩、
  miniprogramRoot、appid、基础库版本，或提到 project.config / 项目设置时使用。
---

# project-config

## 用途

用**直接编辑项目配置文件**的方式管理微信小程序 / 小游戏项目设置。

本 scene **不调用** `wechatide` 工具；用文件系统读写 JSON 即可。

适合场景：

- 开关合法域名校验、热重载、Skyline 调试等本地开发选项
- 调整 ES6 / 增强编译、上传压缩、过滤无依赖文件等编译与上传相关开关
- 修改 `appid`、`miniprogramRoot`、`libVersion`、`packOptions` 等一级字段
- 区分应写入公共配置还是个人私有配置

不适合：

- 打开 / 关闭项目窗口、预览、上传、自动化（用其他 scene）
- 修改微信开发者工具的**全局**偏好（非项目级配置）

官方文档：[项目配置文件](https://developers.weixin.qq.com/miniprogram/dev/devtools/projectconfig.html)

## 配置文件位置

两个文件都在**项目根目录**（与 `project.config.json` 同级），不在 `miniprogramRoot` 里面。

| 文件 | 作用 | 建议 |
|------|------|------|
| `project.config.json` | 团队共享配置；编译 / 上传产物相关开关必须写这里 | 纳入版本管理 |
| `project.private.config.json` | 个人本机偏好；同名字段优先级更高 | 通常加入 `.gitignore` |

生效规则：

1. private 中与 common 同名的字段，以 **private 为准**。
2. **开发期偏好**（见下方「可写 private」）→ 优先改 `project.private.config.json` 的 `setting`。
3. **影响编译 / 上传产物的开关**（见下方「必须写 common」）→ 只能改 `project.config.json` 的 `setting`，写在 private 里不会按预期生效。
4. 改完若看起来没生效，先检查 private 是否覆盖了同名字段。
5. `packOptions`、`watchOptions`、部分根路径字段修改后，可能需要**重新打开项目**才生效。

## 工作流

1. 在项目根找到并读取 `project.config.json`；若存在再读 `project.private.config.json`。
2. 按「private 覆盖 common」理解当前生效值。
3. 根据字段类型选择写入目标文件。
4. **合并修改**：只改需要的键，保留其余字段；保证合法 JSON（无注释、无尾逗号）。
5. 写回磁盘。若开发者工具已打开该项目且未生效，提示用户重新编译或重新打开项目。

## 常见目标

| 用户意图 | 写入文件 | 修改 |
|---------|----------|------|
| 关闭合法域名校验（本地联调） | private | `setting.urlCheck` → `false` |
| 开启保存后热重载 | private | `setting.compileHotReLoad` → `true` |
| 开启 Skyline 调试 | private | `setting.skylineRenderEnable` → `true` |
| 预览放宽主包体积上限 | private | `setting.bigPackageSizeSupport` → `true` |
| 开启 ES6 + 增强编译 | common | `setting.es6` 与 `setting.enhance` **同时**为 `true` |
| 上传时压缩脚本 / 样式 / WXML | common | `setting.minified` / `minifyWXSS` / `minifyWXML` → `true` |
| 上传时过滤无依赖文件 | common | `setting.ignoreUploadUnusedFiles` → `true` |
| 启用 TypeScript / Less | common | `setting.useCompilerPlugins` → `["typescript","less"]` |
| 修改小程序源码目录 | common | `miniprogramRoot`（相对项目根的路径） |
| 指定基础库版本 | common | `libVersion`（如 `"3.5.5"` 或 `"latest"`） |

### 示例：关闭合法域名校验

写入或合并到 `project.private.config.json`：

```json
{
  "setting": {
    "urlCheck": false
  }
}
```

### 示例：开启 ES6 与增强编译

合并到 `project.config.json` 的 `setting`（`es6` 与 `enhance` 必须同开同关）：

```json
{
  "setting": {
    "es6": true,
    "enhance": true
  }
}
```

## `setting` 字段速查

完整说明见官方文档。

### 可写 private（开发期偏好）

| 字段 | 类型 | 说明 |
|------|------|------|
| `urlCheck` | `boolean` | 检查安全域名与 TLS 版本 |
| `compileHotReLoad` | `boolean` | 保存后热重载 |
| `autoAudits` | `boolean` | 自动运行体验评分 |
| `bigPackageSizeSupport` | `boolean` | 预览 / 真机调试放宽主分包体积上限 |
| `skylineRenderEnable` | `boolean` | Skyline 渲染调试 |
| `preloadBackgroundData` | `boolean` | 加载时数据预拉取 |
| `lazyloadPlaceholderEnable` | `boolean` | 懒注入占位组件调试 |
| `ignoreDevUnusedFiles` | `boolean` | 开发阶段过滤无依赖文件 |
| `ignoreCodeQuality` | `boolean` | 开发阶段跳过代码质量检测 |
| `useApiHook` | `boolean` | API Hook（关闭可能影响 mock 等调试能力） |
| `checkInvalidKey` | `boolean` | 展示 JSON 校验错误 |

### 必须写 common（编译 / 上传产物）

| 字段 | 类型 | 说明 |
|------|------|------|
| `es6` | `boolean` | ES6 转 ES5；须与 `enhance` 同开同关 |
| `enhance` | `boolean` | 增强编译；须与 `es6` 同开同关 |
| `condition` | `boolean` | 条件编译 |
| `postcss` | `boolean` | 上传时样式自动补全 |
| `minified` | `boolean` | 上传时压缩脚本 |
| `minifyWXSS` | `boolean` | 上传时压缩样式 |
| `minifyWXML` | `boolean` | 上传时压缩 WXML |
| `swc` | `boolean` | SWC 编译 |
| `uglifyFileName` | `boolean` | 上传时代码保护 |
| `ignoreUploadUnusedFiles` | `boolean` | 上传时过滤无依赖文件 |
| `uploadWithSourceMap` | `boolean` | 上传带 sourcemap |
| `useCompilerPlugins` | `string[] \| false` | 编译插件，如 `["typescript","less"]`；关闭则写 `false` |
| `packNpmManually` | `boolean` | 是否手动配置构建 npm 路径 |
| `packNpmRelationList` | `object[]` | 仅 `packNpmManually` 为 `true` 时生效，指定 packageJson 与产物目录关系 |
| `babelSetting` | `object` | 增强编译下 Babel 配置（如 `ignore` 数组） |
| `minifyWXMLSetting` | `object` | WXML 压缩细节配置 |

## 其他常用一级字段

一般写入 `project.config.json`：

| 字段 | 类型 | 说明 |
|------|------|------|
| `appid` | `string` | 小程序 AppID；若 private 已有 `appid`，以 private 为准 |
| `projectname` | `string` | 项目名称 |
| `compileType` | `string` | `miniprogram`、`plugin` 或 `game` |
| `libVersion` | `string` | 基础库版本号；也可用 `latest` / `trial` / `widelyUsed`（这三项写在 private 无效） |
| `miniprogramRoot` | `string` | 小程序源码目录，相对项目根；`app.json`、页面与组件等通常在此目录下。未配置时默认为项目根 |
| `pluginRoot` | `string` | 插件项目源码目录，相对项目根；`compileType` 为 `plugin` 时使用 |
| `cloudfunctionRoot` | `string` | 云函数代码根目录，相对项目根；云开发云函数工程所在位置 |
| `cloudbaseRoot` | `string` | 云开发（CloudBase）代码根目录，相对项目根；与云开发相关的工程目录 |
| `packOptions` | `object` | 打包选项；含 `ignore` / `include` 数组，改后可能需重开项目 |
| `packOptions.ignore` | `object[]` | 打包时忽略的文件 / 目录规则列表 |
| `packOptions.include` | `object[]` | 打包时强制带上的文件 / 目录规则列表（优先于 `ignore`） |
| `watchOptions` | `object` | 文件监听配置 |
| `watchOptions.ignore` | `string[]` | 忽略展示与监听的 glob 列表；改后需重开项目 |
| `scripts` | `object` | 自定义预处理命令；在编译 / 预览 / 上传前由开发者工具执行本地 shell 命令 |
| `scripts.beforeCompile` | `string` | 编译前执行的命令，例如本地构建脚本 |
| `scripts.beforePreview` | `string` | 预览前执行的命令 |
| `scripts.beforeUpload` | `string` | 上传代码包前执行的命令 |
| `debugOptions` | `object` | 调试相关选项 |
| `debugOptions.hidedInDevtools` | `object[]` | 调试器 Sources 面板隐藏源码的规则（格式同 `packOptions.ignore`） |

`packOptions.ignore` / `include` 与 `debugOptions.hidedInDevtools` 的规则项：

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | `string` | `folder`、`file`、`suffix`、`prefix`、`regexp` 或 `glob` |
| `value` | `string` | 路径或匹配值；表示路径时相对 `miniprogramRoot` |

示例：

```json
{
  "type": "suffix",
  "value": ".webp"
}
```

## 执行约定

- 只通过读写上述 JSON 完成配置变更，不要为此调用 `wechatide -t ...`。
- 不要编造未在官方文档出现的字段名。
- 修改前先读现有文件；合并写入，避免覆盖掉无关配置。
- 输出给用户时说明改了哪个文件、哪个字段、新旧值（如可知）。

## 参考

- [项目配置文件（微信开放文档）](https://developers.weixin.qq.com/miniprogram/dev/devtools/projectconfig.html)
