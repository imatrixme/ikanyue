# 通用路由构建器 (utils/routeBuilder.js)

## 功能描述

提供链式 API 的通用路由构建器，完全中间件无关，支持任意中间件组合、group 级中间件继承、条件中间件、智能中间件处理等高级功能。

## mermaid 流程图

```mermaid
flowchart TD
    A[创建路由构建器] --> B[设置全局中间件?]
    B -->|是| C[factory.use(...middlewares)]
    B -->|否| D[创建路由/分组]
    C --> D

    D --> E{路由还是分组?}
    E -->|路由| F[routes.get/post/put/delete/patch]
    E -->|分组| G[routes.group(prefix, callback)]

    F --> H[RouteBuilder实例]
    G --> I[创建group factory]
    I --> J[继承父级中间件]
    J --> K[group.use(...middlewares)]
    K --> L[子路由创建]
    L --> H

    H --> M[builder.use(...middlewares)]
    M --> N[builder.when(condition, ...middlewares)]
    N --> O[builder.handler(handlerFunc)]
    O --> P[自动build构建]
    P --> Q[注册到Hono应用]

    style A fill:#e1f5fe
    style Q fill:#4caf50
    style P fill:#2196f3
    style I fill:#fff3e0
    style J fill:#f3e5f5
```

## 核心特性

### 1. 完全通用的中间件支持

```javascript
// 支持任何中间件，无业务倾向
routes
    .post('/api/endpoint')
    .use(corsMiddleware, logMiddleware)
    .use(authMiddleware)
    .use(rateLimitMiddleware)
    .handler(handlerFunc);
```

### 2. Group 级中间件继承

```javascript
routes
    .use(corsMiddleware, logMiddleware) // 根级中间件
    .group('/api', (api) => {
        api.use(authMiddleware) // API级中间件
            .group('/admin', (admin) => {
                admin
                    .use(adminMiddleware) // 管理员级中间件
                    .post('/users')
                    .handler(userHandler); // 继承: cors + log + auth + admin
            });
    });
```

### 3. 智能中间件处理

```javascript
// 自动识别工厂函数和普通函数
routes
    .post('/endpoint')
    .use(authMiddleware) // 工厂函数 - 自动调用
    .use(logMiddleware) // 普通函数 - 直接使用
    .use(corsMiddleware()) // 已调用的函数 - 直接使用
    .handler(handlerFunc);
```

### 4. 条件中间件

```javascript
routes.group('/api', (api) => {
    api.when(process.env.NODE_ENV === 'production', securityMiddleware)
        .when(process.env.DEBUG === 'true', debugMiddleware)
        .post('/endpoint')
        .handler(handlerFunc);
});
```

## 核心类设计

### RouteBuilder 类

**主要功能**:

-   链式 API 设计
-   中间件智能处理
-   自动构建和注册

**核心方法**:

-   `handler(func)` - 设置处理器
-   `use(...funcs)` - 添加中间件（主要方法）
-   `middleware(...funcs)` - 添加中间件（别名）
-   `middlewares(...funcs)` - 添加中间件（别名）
-   `when(condition, ...funcs)` - 条件中间件
-   `build()` - 构建并注册路由

### RouteFactory 类

**主要功能**:

-   管理继承中间件
-   自动构建机制
-   路由分组支持

**核心方法**:

-   `get/post/put/delete/patch(path)` - HTTP 方法
-   `use(...funcs)` - 为当前 group 添加中间件
-   `group(prefix, callback)` - 路由分组（支持中间件继承）
-   `when(condition, ...funcs)` - group 级条件中间件
-   `finalize()` - 完成构建

## 使用示例

### 基本使用方式

```javascript
const { createRouteBuilder } = require('../utils/routeBuilder');

// 创建路由构建器，可选设置全局中间件
const routes = createRouteBuilder(app, corsMiddleware, logMiddleware);

// 基本路由
routes.post('/api/login').handler(loginHandler);

// 带中间件的路由
routes.post('/api/profile').use(authMiddleware).handler(profileHandler);

routes.finalize();
```

### 复杂的 group 级中间件继承

```javascript
const routes = createRouteBuilder(app);

// 根级基础中间件
routes.use(corsMiddleware, logMiddleware);

// 应用分组
routes.group('/app', (app) => {
    // 认证分组
    app.use(authMiddleware).group('/user', (user) => {
        // 用户基本操作
        user.get('/profile').handler(profileHandler);

        // 管理员操作子组
        user.use(adminMiddleware).group('/admin', (admin) => {
            admin.post('/create').handler(createUserHandler);

            // 危险操作需要额外限流
            admin.use(rateLimitMiddleware).group('/dangerous', (dangerous) => {
                dangerous.delete('/delete').handler(deleteUserHandler);
            });
        });
    });
});
```

### 条件中间件组合

```javascript
const isProduction = process.env.NODE_ENV === 'production';
const enableDebug = process.env.DEBUG === 'true';

routes.group('/api', (api) => {
    api.when(isProduction, securityMiddleware)
        .when(enableDebug, debugMiddleware)
        .use(authMiddleware)
        .group('/protected', (protected) => {
            protected.post('/action').handler(actionHandler);
        });
});
```

### 动态中间件配置

```javascript
const routes = createRouteBuilder(app);

// 中间件配置表
const middlewareConfig = {
    '/public': [],
    '/protected': [authMiddleware],
    '/admin': [authMiddleware, adminMiddleware],
    '/cached': [authMiddleware, cacheMiddleware],
};

// 根据配置动态创建路由
Object.entries(middlewareConfig).forEach(([path, middlewares]) => {
    const route = routes.get(path);
    if (middlewares.length > 0) {
        route.use(...middlewares);
    }
    route.handler(getHandlerFor(path));
});

routes.finalize();
```

## 高级特性

### 1. 智能中间件处理

路由构建器会自动识别中间件的类型：

```javascript
// 工厂函数：返回中间件函数
const authMiddleware = () => (c, next) => {
    /* ... */
};

// 普通中间件函数
const logMiddleware = (c, next) => {
    /* ... */
};

// 自动处理
routes
    .post('/endpoint')
    .use(authMiddleware) // 自动调用 authMiddleware()
    .use(logMiddleware) // 直接使用
    .use(corsMiddleware()) // 已调用的也支持
    .handler(handlerFunc);
```

### 2. 嵌套 group 中间件继承

```javascript
routes
    .use(globalMiddleware) // 级别1：全局
    .group('/api', (api) => {
        api.use(apiMiddleware) // 级别2：API
            .group('/v1', (v1) => {
                v1.use(versionMiddleware) // 级别3：版本
                    .group('/admin', (admin) => {
                        admin
                            .use(adminMiddleware) // 级别4：管理员
                            .post('/action')
                            .handler(actionHandler);
                        // 最终中间件链：global + api + version + admin
                    });
            });
    });
```

### 3. 灵活的中间件追加

```javascript
// 创建group并设置基础中间件
routes.group('/api', (api) => {
    api.use(authMiddleware);

    // 为特定路由追加额外中间件
    api.post('/upload').use(fileUploadMiddleware, virusScanMiddleware).handler(uploadHandler);

    // 为子group追加中间件
    api.use(rateLimitMiddleware).group('/limited', (limited) => {
        limited.post('/action').handler(limitedActionHandler);
    });
});
```

## 与传统方式对比

### 传统 Hono 方式

```javascript
// 固定且重复
app.post('/api/user/create', cors(), log(), auth(), admin(), createUserHandler);
app.post('/api/user/update', cors(), log(), auth(), admin(), updateUserHandler);
app.post('/api/user/delete', cors(), log(), auth(), admin(), deleteUserHandler);

// 条件中间件复杂
if (process.env.NODE_ENV === 'production') {
    app.post('/api/sensitive', cors(), log(), auth(), security(), handler);
} else {
    app.post('/api/sensitive', cors(), log(), auth(), handler);
}
```

### 新的通用构建器方式

```javascript
// 优雅的group和继承
routes.use(corsMiddleware, logMiddleware, authMiddleware, adminMiddleware).group('/api/user', (user) => {
    user.post('/create').handler(createUserHandler);
    user.post('/update').handler(updateUserHandler);
    user.post('/delete').handler(deleteUserHandler);
});

// 条件中间件优雅处理
routes
    .post('/api/sensitive')
    .use(corsMiddleware, logMiddleware, authMiddleware)
    .when(process.env.NODE_ENV === 'production', securityMiddleware)
    .handler(handler);
```

## 兼容性

### 与 Hono.js 完全兼容

-   底层使用 Hono 的原生路由注册
-   中间件执行顺序保持一致
-   错误处理机制不变
-   性能开销极小

### 渐进式迁移

-   可以与传统路由定义混用
-   不影响现有路由功能
-   支持逐步迁移

## 性能特点

### 构建时开销

-   构建器只在定义时使用，运行时无额外开销
-   智能中间件处理有轻微开销，但在构建时完成
-   大量路由测试：1000 个路由 < 5ms

### 内存使用

-   自动构建避免内存泄漏
-   构建完成后清理临时状态
-   中间件继承通过数组复制，内存安全

### 中间件执行

-   与传统方式执行效率完全相同
-   中间件顺序严格按照添加顺序
-   支持异步中间件

## 依赖关系

本构建器是完全通用的，不依赖特定的中间件。可以与任何符合 Hono 中间件规范的函数配合使用：

-   认证中间件
-   权限中间件
-   日志中间件
-   CORS 中间件
-   限流中间件
-   缓存中间件
-   等等...

## 使用建议

### 最佳实践

1. **一致性**: 在项目中保持一致的中间件组织风格
2. **分层**: 使用 group 进行逻辑分层，避免过深嵌套
3. **命名**: 中间件函数使用清晰的命名
4. **文档**: 为复杂的中间件组合添加注释

### 性能考虑

-   避免在热路径上使用复杂的条件判断
-   合理组织中间件顺序，将高频检查放在前面
-   使用 group 减少重复的中间件声明

## 更新历史

| 版本 | 日期       | 说明                       |
| ---- | ---------- | -------------------------- |
| 2.0  | 2024-12-26 | 重构为完全通用的路由构建器 |
| 1.0  | 2024-12-26 | 创建灵活路由构建器机制     |
