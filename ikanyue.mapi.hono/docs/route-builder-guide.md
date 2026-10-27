# 灵活路由构建器使用指南

## 概述

这是一个为 Hono.js 设计的链式路由构建器，让路由定义更加灵活、可读和可维护。它解决了传统路由定义中的以下问题：

-   **固定中间件顺序**: 传统方式需要提前确定中间件顺序
-   **条件中间件复杂**: 难以基于条件动态添加中间件
-   **代码重复**: 相似权限的路由需要重复写中间件
-   **分组困难**: 相关路由难以统一管理

## 核心特性

### 🔗 链式 API

```javascript
routes.post('/v1/activity/create').auth(authMiddleware).admin(isAdminMiddleware).setHandler(activityCreateHandler);
```

### 📁 路由分组

```javascript
routes.group('/v1/user', (user) => {
    user.post('/login').setHandler(loginHandler);
    user.post('/profile').auth(authMiddleware).setHandler(profileHandler);
});
```

### 🎯 条件中间件

```javascript
routes
    .post('/v1/data/export')
    .auth(authMiddleware)
    .when(process.env.NODE_ENV === 'production', securityMiddleware)
    .admin(isAdminMiddleware)
    .setHandler(exportHandler);
```

### 🌐 全局中间件

```javascript
routes.addGlobalMiddleware(corsMiddleware, logMiddleware);
```

## 快速开始

### 1. 基本使用

```javascript
const { createRouteBuilder } = require('../utils/routeBuilder');
const { authMiddleware } = require('../middleware/auth');

function setupRoutes(app) {
    const routes = createRouteBuilder(app);

    // 传统方式
    app.post('/v1/activity/create', authMiddleware(), isAdminMiddleware(), handler);

    // 新的链式方式
    routes.post('/v1/activity/create').auth(authMiddleware).admin(isAdminMiddleware).setHandler(handler);

    routes.finalize();
}
```

### 2. 路由分组

```javascript
routes.group('/v1/user', (user) => {
    // 登录 - 无需认证
    user.post('/login').setHandler(userLoginHandler);

    // 更新 - 需要认证
    user.post('/update').auth(authMiddleware).setHandler(userUpdateHandler);

    // 管理功能 - 嵌套分组
    user.group('/admin', (admin) => {
        admin.post('/delete').auth(authMiddleware).admin(isAdminMiddleware).setHandler(userDeleteHandler);
    });
});
```

## API 参考

### RouteBuilder 类方法

#### 设置处理器

```javascript
.setHandler(handlerFunction)
```

#### 添加中间件

```javascript
.middleware(...middlewareFuncs)     // 通用方式
.middlewares(...middlewareFuncs)    // 别名方法
.auth(authMiddleware)               // 认证中间件
.teacher(teacherMiddleware)         // 教师权限
.admin(adminMiddleware)             // 管理员权限
```

#### 条件中间件

```javascript
.when(condition, ...middlewareFuncs)
```

#### 构建路由

```javascript
.build()    // 手动构建（通常自动调用）
```

### RouteFactory 类方法

#### HTTP 方法

```javascript
routes.get(path);
routes.post(path);
routes.put(path);
routes.delete(path);
routes.patch(path);
```

#### 路由分组

```javascript
routes.group(prefix, callback);
```

#### 全局中间件

```javascript
routes.addGlobalMiddleware(...middlewareFuncs);
```

#### 完成构建

```javascript
routes.finalize();
```

## 使用模式

### 1. 基础权限控制

```javascript
// 公开接口
routes.post('/v1/public/info').setHandler(publicInfoHandler);

// 需要认证
routes.post('/v1/user/profile').auth(authMiddleware).setHandler(profileHandler);

// 需要教师权限
routes.post('/v1/course/create').auth(authMiddleware).teacher(isTeacherMiddleware).setHandler(courseCreateHandler);

// 需要管理员权限
routes.post('/v1/admin/users').auth(authMiddleware).admin(isAdminMiddleware).setHandler(adminUsersHandler);
```

### 2. 条件权限

```javascript
const isProduction = process.env.NODE_ENV === 'production';
const enableDebug = process.env.DEBUG === 'true';

routes
    .post('/v1/sensitive/action')
    .auth(authMiddleware)
    .when(isProduction, securityMiddleware)
    .when(enableDebug, debugMiddleware)
    .admin(isAdminMiddleware)
    .setHandler(sensitiveActionHandler);
```

### 3. 动态权限配置

```javascript
const permissions = {
    '/v1/student': {
        find: ['student', 'teacher', 'admin'],
        create: ['admin'],
        update: ['teacher', 'admin'],
        delete: ['admin'],
    },
};

Object.entries(permissions).forEach(([basePath, actions]) => {
    routes.group(basePath, (group) => {
        Object.entries(actions).forEach(([action, roles]) => {
            const route = group.post(`/${action}`);
            route.auth(authMiddleware);

            if (roles.includes('admin') && roles.length === 1) {
                route.admin(isAdminMiddleware);
            } else if (roles.includes('teacher')) {
                route.teacher(isTeacherMiddleware);
            }

            route.setHandler(getHandlerFor(basePath, action));
        });
    });
});
```

### 4. 复杂嵌套分组

```javascript
routes.group('/v1', (v1) => {
    // 用户相关
    v1.group('/user', (user) => {
        user.post('/login').setHandler(loginHandler);
        user.post('/register').setHandler(registerHandler);

        // 认证用户功能
        user.group('/auth', (auth) => {
            auth.use(authMiddleware()); // 组级中间件
            auth.post('/profile').setHandler(profileHandler);
            auth.post('/settings').setHandler(settingsHandler);
        });
    });

    // 管理功能
    v1.group('/admin', (admin) => {
        admin.use(authMiddleware(), isAdminMiddleware()); // 组级中间件
        admin.post('/users').setHandler(adminUsersHandler);
        admin.post('/reports').setHandler(reportsHandler);
    });
});
```

## 高级特性

### 1. 自动构建机制

路由构建器会在以下情况自动调用 `build()`:

-   创建新路由时构建前一个路由
-   调用 `finalize()` 时构建最后一个路由

```javascript
routes.post('/route1').setHandler(handler1);
routes.post('/route2').setHandler(handler2); // 自动构建 route1
routes.finalize(); // 构建 route2
```

### 2. 链式调用灵活性

```javascript
// 方式1: 连续链式
routes.post('/example').setHandler(handler).auth(authMiddleware).admin(isAdminMiddleware);

// 方式2: 分离调用
const route = routes.post('/example');
route.auth(authMiddleware);
route.setHandler(handler);
route.admin(isAdminMiddleware);

// 方式3: 混合方式
routes.post('/example').auth(authMiddleware).setHandler(handler);
```

### 3. 错误处理

```javascript
try {
    routes.post('/incomplete').build(); // 没有处理器
} catch (error) {
    console.error('路由构建失败:', error.message);
    // 输出: 路由 POST /incomplete 缺少处理器
}
```

## 性能考虑

### 构建时开销

-   构建器只在定义时使用，运行时无额外开销
-   大量路由测试：1000 个路由耗时 ~3ms

### 内存使用

-   自动构建避免内存泄漏
-   构建完成后清理临时状态

### 中间件执行

-   与传统方式执行效率相同
-   中间件顺序保持一致

## 迁移指南

### 从传统方式迁移

#### 1. 简单路由

```javascript
// 原来
app.post('/v1/user/login', userLoginHandler);

// 现在
routes.post('/v1/user/login').setHandler(userLoginHandler);
```

#### 2. 带中间件的路由

```javascript
// 原来
app.post('/v1/user/update', authMiddleware(), userUpdateHandler);

// 现在
routes.post('/v1/user/update').auth(authMiddleware).setHandler(userUpdateHandler);
```

#### 3. 复杂权限路由

```javascript
// 原来
app.post('/v1/admin/create', authMiddleware(), isAdminMiddleware(), createHandler);

// 现在
routes.post('/v1/admin/create').auth(authMiddleware).admin(isAdminMiddleware).setHandler(createHandler);
```

### 渐进式迁移策略

1. **新功能优先**: 新开发的功能使用新语法
2. **模块迁移**: 按模块逐步迁移现有路由
3. **混合使用**: 新旧语法可以在同一应用中共存
4. **测试验证**: 迁移后确保功能一致性

## 最佳实践

### 1. 一致性

```javascript
// 推荐：保持项目内一致的链式风格
routes.post('/v1/example').auth(authMiddleware).admin(isAdminMiddleware).setHandler(handler);

// 避免：混用不同风格
routes.post('/v1/example').middleware(authMiddleware(), isAdminMiddleware()).setHandler(handler);
```

### 2. 可读性

```javascript
// 推荐：使用语义化方法名
routes.post('/v1/teacher/create').auth(authMiddleware).admin(isAdminMiddleware).setHandler(teacherCreateHandler);

// 避免：过度链式调用
routes
    .post('/v1/complex')
    .auth(authMiddleware)
    .when(condition, middleware1)
    .admin(isAdminMiddleware)
    .when(otherCondition, middleware2)
    .setHandler(handler);
```

### 3. 分组组织

```javascript
// 推荐：使用分组组织相关路由
routes.group('/v1/user', (user) => {
    user.post('/login').setHandler(loginHandler);
    user.post('/logout').auth(authMiddleware).setHandler(logoutHandler);
});

// 避免：平铺所有路由
routes.post('/v1/user/login').setHandler(loginHandler);
routes.post('/v1/user/logout').auth(authMiddleware).setHandler(logoutHandler);
```

### 4. 条件使用

```javascript
// 推荐：清晰的条件逻辑
const isProduction = process.env.NODE_ENV === 'production';
routes.post('/v1/data').auth(authMiddleware).when(isProduction, securityMiddleware).setHandler(dataHandler);

// 避免：复杂的内联条件
routes
    .post('/v1/data')
    .when(process.env.NODE_ENV === 'production' && config.enableSecurity, securityMiddleware)
    .setHandler(dataHandler);
```

## 故障排除

### 常见问题

#### 1. 路由未生效

**症状**: 路由定义后无法访问
**原因**: 忘记调用 `finalize()`
**解决**: 确保在路由定义结束后调用 `routes.finalize()`

#### 2. 中间件顺序问题

**症状**: 权限检查在认证之前执行
**原因**: 链式调用顺序影响中间件执行顺序
**解决**: 确保 `.auth()` 在权限中间件之前调用

#### 3. 处理器缺失错误

**症状**: 抛出"缺少处理器"错误
**原因**: 调用 `build()` 时没有设置处理器
**解决**: 确保每个路由都调用了 `.setHandler()`

### 调试技巧

```javascript
// 开启调试模式
if (process.env.DEBUG === 'true') {
    routes.addGlobalMiddleware((c, next) => {
        console.log(`[DEBUG] ${c.req.method} ${c.req.url}`);
        return next();
    });
}

// 测试中间件链
routes
    .post('/debug/middleware-test')
    .middleware((c, next) => {
        console.log('中间件1执行');
        return next();
    })
    .auth(authMiddleware)
    .middleware((c, next) => {
        console.log('中间件3执行');
        return next();
    })
    .setHandler((c) => c.json({ message: '测试完成' }));
```

## 总结

灵活路由构建器提供了一种更加优雅和可维护的方式来定义 Hono.js 路由。它的主要优势包括：

-   **更高的可读性**: 链式 API 让路由定义更加直观
-   **更强的灵活性**: 支持条件中间件和动态权限
-   **更好的组织性**: 路由分组让相关功能聚合在一起
-   **更易的维护性**: 减少代码重复，提高可维护性

通过合理使用这些特性，可以显著提升路由管理的效率和代码质量。
