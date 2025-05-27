# 音频材料模块路由 (routes/audioMaterial/index.js)

## 功能描述
音频材料模块的路由配置，包含音频材料相关的所有接口路由注册。

## mermaid 流程图

```mermaid
flowchart TD
    A[音频材料模块路由注册] --> B[查询路由 /find]
    A --> C[创建路由 /create]
    A --> D[更新路由 /update]
    A --> E[删除路由 /delete]
    
    B --> B1[POST /v1/audioMaterial/find]
    C --> C1[POST /v1/audioMaterial/create]
    D --> D1[POST /v1/audioMaterial/update]
    E --> E1[POST /v1/audioMaterial/delete]
    
    style A fill:#e1f5fe
    style B1 fill:#4caf50
    style C1 fill:#4caf50
    style D1 fill:#4caf50
    style E1 fill:#4caf50
```

## 路由配置

| 路径 | 方法 | 功能 | 权限要求 |
|------|------|------|----------|
| `/find` | POST | 查询音频材料 | 需要认证 |
| `/create` | POST | 创建音频材料 | 需要认证 |
| `/update` | POST | 更新音频材料 | 需要认证 |
| `/delete` | POST | 删除音频材料 | 需要认证 |

## 依赖关系

- [查询处理器](mdc:src/routes/audioMaterial/find.js.md)
- [创建处理器](mdc:src/routes/audioMaterial/create.js.md)
- [更新处理器](mdc:src/routes/audioMaterial/update.js.md)
- [删除处理器](mdc:src/routes/audioMaterial/delete.js.md)
- [认证中间件](mdc:src/middleware/auth.js.md)

## 更新历史

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.0 | 2024-12-26 | 创建音频材料模块路由配置 |
