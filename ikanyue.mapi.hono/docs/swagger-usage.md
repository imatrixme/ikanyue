# Swagger 文档自动化使用指南

## 概述

ikanyue-hono 项目已集成自动化 Swagger 文档生成功能，支持从代码和 Markdown 文档自动生成完整的 API 文档。

## 快速开始

### 1. 生成 Swagger 文档

```bash
# 收集所有 .swagger.json 文件并合并
npm run swagger:collect

# 启动 SwaggerUI 服务（开发环境）
npm run swagger:serve

# 一键生成并启动（推荐）
npm run swagger:dev
```

### 2. 访问文档

-   **SwaggerUI**: http://localhost:3001/swagger
-   **JSON API**: http://localhost:3001/swagger.json
-   **健康检查**: http://localhost:3001/health

## 文档结构

### 自动生成规则

对于每个路由文件 `xxx.js`，当对应的 `xxx.md` 文档确认后，会自动生成 `xxx.swagger.json`：

```
src/routes/activity/
├── create.js           # 路由实现
├── create.js.md        # 接口文档
└── create.swagger.json # 自动生成的 Swagger 定义
```

### 当前已生成的接口

-   ✅ `/v1/activity/create` - 活动创建接口
-   ✅ `/v1/activity/find` - 活动查询接口
-   ✅ `/v1/activity/update` - 活动更新接口
-   ✅ `/v1/activity/delete` - 活动删除接口

## 环境控制

### 开发环境

-   SwaggerUI 正常访问
-   独立端口 3001 提供服务
-   支持实时测试 API

### 生产环境

-   `/swagger` 路由返回 404
-   不暴露 API 文档信息
-   确保安全性

## 文档特性

### 完整的接口信息

-   📋 详细的参数定义和验证规则
-   🔍 丰富的响应示例和错误代码
-   🔐 权限要求和认证方式
-   📊 真实的数据示例

### 自动化流程

-   🔄 自动收集所有 swagger.json 文件
-   🔗 智能合并为统一文档
-   🏷️ 自动分类和标签管理
-   📈 统计信息和质量检查

## 开发工作流

### 1. 创建新接口

```bash
# 1. 实现路由文件
touch src/routes/module/action.js

# 2. 编写接口文档
touch src/routes/module/action.js.md

# 3. 生成 swagger 定义
touch src/routes/module/action.swagger.json
```

### 2. 更新文档

```bash
# 修改代码或文档后，重新生成
npm run swagger:collect
```

### 3. 预览文档

```bash
# 启动 SwaggerUI 服务
npm run swagger:dev
```

## 配置选项

### 环境变量

-   `SWAGGER_PORT`: SwaggerUI 服务端口（默认 3001）
-   `NODE_ENV`: 环境控制（production 时禁用 swagger）

### 自定义配置

可以修改 `scripts/collect-swagger.js` 中的配置：

-   服务器地址
-   文档标题和描述
-   标签分类

## 最佳实践

### 1. 文档质量

-   ✅ 确保响应示例真实完整
-   ✅ 包含所有错误情况的示例
-   ✅ 参数验证规则准确
-   ✅ 权限要求明确

### 2. 维护同步

-   🔄 代码修改后立即更新 swagger.json
-   📝 保持文档与实现一致
-   🧪 定期验证接口可用性

### 3. 安全考虑

-   🔒 生产环境禁用文档访问
-   🛡️ 敏感信息不出现在示例中
-   🔐 正确配置认证要求

## 故障排除

### 常见问题

1. **swagger.json 文件不存在**

    ```bash
    npm run swagger:collect
    ```

2. **SwaggerUI 无法访问**

    - 检查端口 3001 是否被占用
    - 确认在开发环境运行

3. **文档内容不完整**
    - 检查 .swagger.json 文件语法
    - 验证 JSON 格式正确性

### 调试命令

```bash
# 检查生成的文档
cat docs/swagger.json | jq .

# 验证 JSON 语法
node -e "console.log(JSON.parse(require('fs').readFileSync('docs/swagger.json')))"
```

## 扩展功能

### 计划中的功能

-   [ ] 自动化测试集成
-   [ ] 文档版本管理
-   [ ] 多语言支持
-   [ ] 自定义主题

### 贡献指南

欢迎提交 PR 来改进 Swagger 自动化功能！

---

📚 更多信息请参考：[Swagger 自动化规范](../.cursor/rules/swagger-automation.mdc)
