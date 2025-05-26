# ikanyue-hono API 文档

基于 Hono.js 重写的看粤语 API 服务，完全兼容原 Sails.js 项目的接口和响应格式。

## 服务信息

-   **服务地址**: http://localhost:1337
-   **版本**: 1.0.0
-   **框架**: Hono.js
-   **运行时**: Node.js / Bun

## 响应格式

所有接口都遵循统一的响应格式：

### 成功响应

```json
{
    "code": 10000,
    "message": "操作成功信息",
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

## 认证机制

需要认证的接口需要在请求头中携带 JWT 令牌：

```
Authorization: Bearer <jwt_token>
```

## 接口列表

### 1. 健康检查

#### GET /

检查服务运行状态

**响应示例**:

```json
{
    "message": "ikanyue-hono API 服务运行正常",
    "version": "1.0.0",
    "timestamp": "2025-05-26T14:50:01.560Z"
}
```

---

## 用户相关接口

### 1. 用户登录

#### POST /v1/user/login

统一登录接口，先尝试学生登录，失败则尝试教师登录，都找不到则自动注册学生用户

**请求体**:

```json
{
    "cellphone": "13800138000", // 必传: 手机号
    "password": "yourpassword" // 必传: 密码
}
```

**成功响应**:

```json
{
    "code": 10000,
    "message": null,
    "data": {
        "id": "record_id",
        "sn": "unique_sn",
        "cellphone": "13800138000",
        "role": "student|teacher",
        "token": "jwt_token",
        "isAdmin": false
        // 其他用户信息...
    }
}
```

### 2. 更新用户信息

#### POST /v1/user/update

更新当前登录用户的信息（需要认证）

**请求体**:

```json
{
    "realName": "张三",
    "nickName": "小张",
    "avatar": "https://example.com/avatar.jpg",
    "gender": 1, // 0:未知，1:男，2:女
    "age": 20,
    "province": "广东省",
    "city": "深圳市",
    "address": "南山区科技园"
}
```

### 3. 刷新用户令牌

#### POST /v1/user/refresh

刷新用户信息和令牌（需要认证）

**请求体**: 无需请求体，用户信息从 JWT 令牌中获取

---

## 学生管理接口

### 1. 查询学生

#### POST /v1/student/find

查询学生记录（需要认证）

**查询单个学生**:

```json
{
    "id": "student_id"
}
```

**查询学生列表**:

```json
{
    "page": 1,
    "limit": 20,
    "query": "搜索关键词" // 可选，在手机号、姓名、昵称、SN中搜索
}
```

### 2. 创建学生

#### POST /v1/student/create

创建学生记录（需要认证）

**请求体**:

```json
{
    "cellphone": "13800138000", // 必传: 手机号
    "password": "yourpassword", // 必传: 密码
    "realname": "张三", // 可选: 真实姓名
    "nickName": "小张", // 可选: 昵称
    "avatar": "https://example.com/avatar.jpg", // 可选: 头像URL
    "gender": 1, // 可选: 性别，默认 0
    "age": 20, // 可选: 年龄
    "province": "广东省", // 可选: 省份
    "city": "深圳市", // 可选: 城市
    "address": "南山区科技园", // 可选: 地址
    "hours": 0 // 可选: 课时，默认 0
}
```

### 3. 更新学生

#### POST /v1/student/update

更新学生记录（需要认证）

**请求体**:

```json
{
    "id": "record_id", // 必传: 学生记录ID
    "realname": "张三", // 可选: 真实姓名
    "nickName": "小张", // 可选: 昵称
    "avatar": "https://example.com/avatar.jpg", // 可选: 头像URL
    "gender": 1, // 可选: 性别
    "age": 20, // 可选: 年龄
    "province": "广东省", // 可选: 省份
    "city": "深圳市", // 可选: 城市
    "address": "南山区科技园", // 可选: 地址
    "password": "newpassword" // 可选: 新密码
}
```

### 4. 删除学生

#### POST /v1/student/delete

删除学生记录（需要认证）

**请求体**:

```json
{
    "id": "record_id" // 必传: 学生记录ID
}
```

---

## 教师管理接口

### 1. 查询教师

#### POST /v1/teacher/find

查询教师记录（需要认证）

**查询单个教师**:

```json
{
    "id": "teacher_id"
}
```

**查询教师列表**:

```json
{
    "page": 1,
    "limit": 20,
    "query": "搜索关键词" // 可选，在手机号、姓名、昵称、SN中搜索
}
```

### 2. 创建教师

#### POST /v1/teacher/create

创建教师记录（需要认证）

**请求体**:

```json
{
    "cellphone": "13800138000", // 必传: 手机号
    "password": "yourpassword", // 必传: 密码
    "realname": "李老师", // 可选: 真实姓名
    "nickName": "小李", // 可选: 昵称
    "avatar": "https://example.com/avatar.jpg", // 可选: 头像URL
    "gender": 1, // 可选: 性别，默认 0
    "age": 30, // 可选: 年龄
    "province": "广东省", // 可选: 省份
    "city": "深圳市", // 可选: 城市
    "address": "南山区科技园", // 可选: 地址
    "hours": 0 // 可选: 课时，默认 0
}
```

**注意**: 新创建的教师默认为未审核状态（verified: false），需要管理员审核后才能正常登录。

### 3. 更新教师

#### POST /v1/teacher/update

更新教师记录（需要认证）

**请求体**:

```json
{
    "id": "record_id", // 必传: 教师记录ID
    "realname": "李老师", // 可选: 真实姓名
    "nickName": "小李", // 可选: 昵称
    "avatar": "https://example.com/avatar.jpg", // 可选: 头像URL
    "gender": 1, // 可选: 性别
    "age": 30, // 可选: 年龄
    "province": "广东省", // 可选: 省份
    "city": "深圳市", // 可选: 城市
    "address": "南山区科技园", // 可选: 地址
    "password": "newpassword" // 可选: 新密码
}
```

**注意**: 敏感字段（blocked、verified、isAdmin 等）不能通过此接口修改。

### 4. 删除教师

#### POST /v1/teacher/delete

删除教师记录（需要认证）

**请求体**:

```json
{
    "id": "record_id" // 必传: 教师记录ID
}
```

---

## 错误代码说明

| 错误代码 | 说明                       |
| -------- | -------------------------- |
| 10000    | 操作成功                   |
| 400      | 请求参数错误               |
| 401      | 认证失败                   |
| 403      | 权限不足或账户被封禁       |
| 404      | 资源不存在                 |
| 409      | 资源冲突（如手机号已注册） |
| 500      | 服务器内部错误             |

---

## 开发说明

### 项目结构

```
src/
├── index.js              # 应用入口
├── middleware/           # 中间件
│   ├── auth.js          # 认证中间件
│   └── response.js      # 响应格式化中间件
├── routes/              # 路由模块
│   ├── index.js         # 路由配置
│   ├── user/            # 用户相关路由
│   ├── student/         # 学生管理路由
│   └── teacher/         # 教师管理路由
└── utils/               # 工具类
    ├── pocketbase.js    # PocketBase 客户端
    └── jwtAuth.js       # JWT 认证工具
```

### 启动服务

```bash
# 使用 Node.js
node src/index.js

# 使用 Bun（如果已安装）
bun run dev
```

### 环境变量

-   `PORT`: 服务端口，默认 1337
-   `DEFAULT_AVATAR`: 默认头像 URL
-   `JWT_SECRET`: JWT 密钥
-   `POCKETBASE_URL`: PocketBase 服务地址

---

## 兼容性说明

本项目完全兼容原 Sails.js 项目的：

-   接口路径和参数
-   响应格式和错误代码
-   认证机制和权限控制
-   PocketBase 数据库操作
-   业务逻辑和数据验证

可以无缝替换原项目，无需修改前端代码。
