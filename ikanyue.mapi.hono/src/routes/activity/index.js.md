# 活动模块路由 (routes/activity/index.js)

## 功能描述
活动模块的路由配置，包含活动相关的所有接口路由注册。

## mermaid 流程图

```mermaid
flowchart TD
    A[活动模块路由注册] --> B[查询路由 /find]
    A --> C[创建路由 /create]
    A --> D[更新路由 /update]
    A --> E[删除路由 /delete]
    
    B --> B1[POST /v1/activity/find]
    C --> C1[POST /v1/activity/create]
    D --> D1[POST /v1/activity/update]
    E --> E1[POST /v1/activity/delete]
    
    style A fill:#e1f5fe
    style B1 fill:#4caf50
    style C1 fill:#4caf50
    style D1 fill:#4caf50
    style E1 fill:#4caf50
```

## 路由配置

| 路径 | 方法 | 功能 | 权限要求 |
|------|------|------|----------|
| `/find` | POST | 查询活动 | 需要认证 |
| `/create` | POST | 创建活动 | 需要认证 |
| `/update` | POST | 更新活动 | 需要认证 |
| `/delete` | POST | 删除活动 | 需要认证 |

## 依赖关系

- [查询处理器](mdc:src/routes/activity/find.js.md)
- [创建处理器](mdc:src/routes/activity/create.js.md)
- [更新处理器](mdc:src/routes/activity/update.js.md)
- [删除处理器](mdc:src/routes/activity/delete.js.md)
- [认证中间件](mdc:src/middleware/auth.js.md)

## 更新历史

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.0 | 2024-12-26 | 创建活动模块路由配置 |
