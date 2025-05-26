# ikanyue-hono

基于 Hono.js 的 ikanyue 后端 API 服务

## 项目特性

-   🚀 使用 Hono.js 轻量级 Web 框架
-   📦 使用 Bun 作为运行时和包管理器
-   🗄️ 集成 PocketBase 作为数据库
-   🔐 JWT 认证系统
-   📁 模块化路由组织
-   🛡️ 完善的中间件系统

## 快速开始

### 环境要求

-   Bun >= 1.0.0
-   PocketBase 服务器

### 安装依赖

```bash
bun install
```

### 环境配置

复制环境变量示例文件并配置：

```bash
cp env.example .env
```

编辑 `.env` 文件，配置 PocketBase 连接信息：

```env
PB_URL=http://127.0.0.1:8090
PB_EMAIL=your_admin_email
PB_PASSWORD=your_admin_password
PORT=3000
DEFAULT_AVATAR=https://example.com/default-avatar.png
```

### 启动开发服务器

```bash
bun run dev
```

### 生产环境启动

```bash
bun run start
```

## API 接口

### 用户相关

-   `POST /v1/user/login` - 用户登录
-   `POST /v1/user/update` - 更新用户信息（需要认证）
-   `POST /v1/user/refresh` - 刷新用户令牌（需要认证）

### 请求示例

#### 用户登录

```bash
curl -X POST http://localhost:3000/v1/user/login \
  -H "Content-Type: application/json" \
  -d '{
    "cellphone": "13800138000",
    "password": "yourpassword"
  }'
```

#### 更新用户信息

```bash
curl -X POST http://localhost:3000/v1/user/update \
  -H "Content-Type: application/json" \
  -H "token: your_jwt_token" \
  -d '{
    "nickname": "新昵称",
    "avatar": "https://example.com/avatar.jpg"
  }'
```

## 项目结构

```
src/
├── index.js              # 应用入口文件
├── middleware/            # 中间件
│   ├── auth.js           # 认证中间件
│   └── response.js       # 响应格式化中间件
├── routes/               # 路由处理器
│   └── user/            # 用户相关路由
│       ├── login.js     # 登录
│       ├── update.js    # 更新信息
│       └── refresh.js   # 刷新令牌
└── utils/               # 工具函数
    ├── pocketbase.js    # PocketBase 客户端
    └── jwtAuth.js       # JWT 认证工具
```

## 开发说明

### 添加新路由

1. 在 `src/routes/` 下创建对应的文件夹和文件
2. 在 `src/index.js` 中导入并注册路由

### 中间件

-   `responseMiddleware`: 为响应对象添加 `success()` 和 `error()` 方法
-   `authMiddleware`: JWT 认证中间件，验证用户身份

### PocketBase 集成

项目使用 PocketBase 作为数据库，支持：

-   自动重连
-   错误处理
-   环境配置

## 部署

### 使用 Bun

```bash
bun run start
```

### 使用 PM2

```bash
pm2 start ecosystem.config.js
```

## 许可证

MIT License
