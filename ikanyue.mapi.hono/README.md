# ikanyue-hono API 服务

基于 Hono.js 框架重写的 ikanyue 后端 API 服务，从原 Sails.js 项目迁移而来，保持完全兼容。

## 项目特性

-   🚀 **高性能**: 基于 Hono.js 轻量级框架
-   🔒 **安全认证**: JWT 认证机制，支持多角色权限
-   📊 **数据库**: PocketBase 集成，保持原项目数据结构
-   🎯 **完全兼容**: 与原 Sails.js 项目 API 完全兼容
-   📁 **模块化**: 按功能模块组织路由和中间件
-   🛡️ **权限控制**: 支持学生、教师、管理员三级权限

## 技术栈

-   **框架**: Hono.js
-   **运行时**: Node.js / Bun
-   **数据库**: PocketBase
-   **认证**: JWT
-   **错误处理**: await-to-js
-   **加密**: MD5 (保持原项目兼容)

## 项目结构

```
src/
├── index.js                 # 应用入口
├── middleware/              # 中间件
│   ├── auth.js             # 认证中间件
│   ├── isTeacher.js        # 教师权限中间件
│   ├── isAdmin.js          # 管理员权限中间件
│   └── response.js         # 响应格式化中间件
├── routes/                  # 路由模块
│   ├── index.js            # 主路由配置
│   ├── user/               # 用户相关路由
│   ├── student/            # 学生管理路由
│   ├── teacher/            # 教师管理路由
│   ├── activity/           # 活动管理路由
│   ├── videoMaterial/      # 视频材料路由
│   └── audioMaterial/      # 音频材料路由
└── utils/                   # 工具类
    ├── pocketbase.js       # PocketBase 数据库工具
    └── jwtAuth.js          # JWT 认证工具
```

## 快速开始

### 环境要求

-   Node.js >= 16.0.0
-   PocketBase 数据库服务

### 安装依赖

```bash
npm install
```

### 环境配置

创建 `.env` 文件：

```env
# 服务端口
PORT=1337

# PocketBase 配置
POCKETBASE_URL=http://localhost:8090

# JWT 配置
JWT_SECRET=your_jwt_secret_key

# 默认头像
DEFAULT_AVATAR=https://example.com/default-avatar.jpg
```

### 启动服务

```bash
# 开发模式
npm run dev

# 生产模式
npm start

# 使用 Bun (如果已安装)
bun run dev
```

## API 接口

### 用户认证

| 接口         | 方法 | 路径               | 说明          |
| ------------ | ---- | ------------------ | ------------- |
| 用户登录     | POST | `/v1/user/login`   | 学生/教师登录 |
| 用户信息更新 | POST | `/v1/user/update`  | 更新个人信息  |
| Token 刷新   | POST | `/v1/user/refresh` | 刷新访问令牌  |

### 学生管理

| 接口     | 方法 | 路径                 | 权限 | 说明         |
| -------- | ---- | -------------------- | ---- | ------------ |
| 学生查询 | POST | `/v1/student/find`   | 认证 | 查询学生列表 |
| 学生创建 | POST | `/v1/student/create` | 认证 | 创建学生账户 |
| 学生更新 | POST | `/v1/student/update` | 认证 | 更新学生信息 |
| 学生删除 | POST | `/v1/student/delete` | 认证 | 删除学生账户 |

### 教师管理

| 接口     | 方法 | 路径                 | 权限 | 说明         |
| -------- | ---- | -------------------- | ---- | ------------ |
| 教师查询 | POST | `/v1/teacher/find`   | 认证 | 查询教师列表 |
| 教师创建 | POST | `/v1/teacher/create` | 认证 | 创建教师账户 |
| 教师更新 | POST | `/v1/teacher/update` | 认证 | 更新教师信息 |
| 教师删除 | POST | `/v1/teacher/delete` | 认证 | 删除教师账户 |

### 活动管理

| 接口     | 方法 | 路径                  | 权限   | 说明         |
| -------- | ---- | --------------------- | ------ | ------------ |
| 活动查询 | POST | `/v1/activity/find`   | 认证   | 查询活动列表 |
| 活动创建 | POST | `/v1/activity/create` | 管理员 | 创建新活动   |
| 活动更新 | POST | `/v1/activity/update` | 管理员 | 更新活动信息 |
| 活动删除 | POST | `/v1/activity/delete` | 管理员 | 删除活动     |

### 视频材料

| 接口     | 方法 | 路径                       | 权限 | 说明         |
| -------- | ---- | -------------------------- | ---- | ------------ |
| 视频查询 | POST | `/v1/videoMaterial/find`   | 认证 | 查询视频列表 |
| 视频创建 | POST | `/v1/videoMaterial/create` | 教师 | 上传视频材料 |
| 视频更新 | POST | `/v1/videoMaterial/update` | 教师 | 更新视频信息 |
| 视频删除 | POST | `/v1/videoMaterial/delete` | 教师 | 删除视频材料 |

### 音频材料

| 接口     | 方法 | 路径                       | 权限 | 说明         |
| -------- | ---- | -------------------------- | ---- | ------------ |
| 音频查询 | POST | `/v1/audioMaterial/find`   | 认证 | 查询音频列表 |
| 音频创建 | POST | `/v1/audioMaterial/create` | 教师 | 上传音频材料 |
| 音频更新 | POST | `/v1/audioMaterial/update` | 教师 | 更新音频信息 |
| 音频删除 | POST | `/v1/audioMaterial/delete` | 教师 | 删除音频材料 |

## 响应格式

### 成功响应

```json
{
    "code": 10000,
    "message": "操作成功",
    "data": {
        // 响应数据
    }
}
```

### 错误响应

```json
{
    "code": 400,
    "message": "错误信息",
    "data": null
}
```

## 权限说明

### 权限层级

1. **无需认证** - 公开接口
2. **基础认证** - 需要登录的用户
3. **教师权限** - 教师及管理员
4. **管理员权限** - 仅管理员

### 认证流程

1. 用户通过 `/v1/user/login` 登录获取 JWT Token
2. 后续请求在 Header 中携带 `Authorization: Bearer <token>`
3. 认证中间件验证 Token 并注入用户信息到上下文
4. 权限中间件根据用户角色进行权限验证

## 开发指南

### 添加新接口

1. 在对应模块目录下创建处理器文件
2. 在模块的 `index.js` 中注册路由
3. 根据需要添加权限中间件
4. 编写对应的文档说明

### 中间件开发

-   认证中间件：验证 JWT Token，注入用户信息
-   权限中间件：验证用户角色权限
-   响应中间件：统一响应格式

### 错误处理

使用 `await-to-js` 处理异步操作：

```javascript
const [err, result] = await to(asyncOperation());
if (err) {
    return c.error(500, '操作失败');
}
```

## 部署说明

### 生产环境

1. 设置环境变量
2. 启动 PocketBase 数据库服务
3. 运行 `npm start` 启动应用

### Docker 部署

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src ./src
EXPOSE 1337
CMD ["npm", "start"]
```

## 兼容性

本项目与原 Sails.js 项目完全兼容：

-   ✅ 相同的 API 路径和参数
-   ✅ 相同的响应格式和错误代码
-   ✅ 相同的认证机制和权限控制
-   ✅ 相同的数据库操作逻辑

## 贡献指南

1. Fork 项目
2. 创建功能分支
3. 提交更改
4. 推送到分支
5. 创建 Pull Request

## 许可证

MIT License

## 更新日志

### v1.0.0 (2024-01-XX)

-   🎉 从 Sails.js 迁移到 Hono.js
-   ✨ 完整的用户认证系统
-   🔧 学生、教师、活动管理功能
-   📚 视频、音频材料管理
-   🛡️ 完善的权限控制系统
