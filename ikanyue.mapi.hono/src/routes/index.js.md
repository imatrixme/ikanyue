# 路由注册模块 (routes/index.js)

## 功能描述

集中式路由注册模块，负责将各业务模块的路由统一注册到 Hono 应用实例中，实现模块化的路由管理。

## mermaid 流程图

```mermaid
flowchart TD
    A[registerRoutes 调用] --> B[注册健康检查路由]
    B --> C[注册用户模块路由]
    C --> D[注册学生模块路由]
    D --> E[注册教师模块路由]
    E --> F[注册音频材料路由]
    F --> G[注册视频材料路由]
    G --> H[注册活动模块路由]
    H --> I[路由注册完成]

    B1[GET /] --> B2[返回服务状态]
    C1[/v1/user/*] --> C2[用户相关接口]
    D1[/v1/student/*] --> D2[学生管理接口]
    E1[/v1/teacher/*] --> E2[教师管理接口]
    F1[/v1/audioMaterial/*] --> F2[音频材料接口]
    G1[/v1/videoMaterial/*] --> G2[视频材料接口]
    H1[/v1/activity/*] --> H2[活动管理接口]

    style A fill:#e1f5fe
    style I fill:#4caf50
```

## 核心功能

### 1. 健康检查路由

```javascript
app.get('/', (c) => {
    return c.data({
        service: 'ikanyue-hono API',
        version: '1.0.0',
        status: 'running',
        timestamp: new Date().toISOString(),
    });
});
```

### 2. 模块化路由注册

按业务功能分组注册路由：

-   **用户模块** (`/v1/user/*`)
-   **学生模块** (`/v1/student/*`)
-   **教师模块** (`/v1/teacher/*`)
-   **音频材料** (`/v1/audioMaterial/*`)
-   **视频材料** (`/v1/videoMaterial/*`)
-   **活动模块** (`/v1/activity/*`)

## 路由模块依赖

-   [用户路由](mdc:src/routes/user/index.js.md) - 登录、更新、刷新令牌
-   [学生路由](mdc:src/routes/student/index.js.md) - 学生信息 CRUD
-   [教师路由](mdc:src/routes/teacher/index.js.md) - 教师信息 CRUD
-   [音频材料路由](mdc:src/routes/audioMaterial/index.js.md) - 音频材料管理
-   [视频材料路由](mdc:src/routes/videoMaterial/index.js.md) - 视频材料管理
-   [活动路由](mdc:src/routes/activity/index.js.md) - 活动管理

## API 路径规范

| 模块     | 基础路径             | 功能      |
| -------- | -------------------- | --------- |
| 健康检查 | `/`                  | 服务状态  |
| 用户管理 | `/v1/user/`          | 认证相关  |
| 学生管理 | `/v1/student/`       | 学生 CRUD |
| 教师管理 | `/v1/teacher/`       | 教师 CRUD |
| 音频材料 | `/v1/audioMaterial/` | 音频资源  |
| 视频材料 | `/v1/videoMaterial/` | 视频资源  |
| 活动管理 | `/v1/activity/`      | 活动 CRUD |

## 使用示例

### 服务状态检查

```bash
curl http://localhost:1337/
```

响应:

```json
{
    "code": 10000,
    "message": null,
    "data": {
        "service": "ikanyue-hono API",
        "version": "1.0.0",
        "status": "running",
        "timestamp": "2024-12-26T02:01:18.000Z"
    }
}
```

## 更新历史

| 版本 | 日期       | 说明                   |
| ---- | ---------- | ---------------------- |
| 1.0  | 2024-12-26 | 创建集中式路由注册模块 |
