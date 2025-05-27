# 更新用户信息 (routes/user/update.js)

## 功能描述

更新用户信息接口，允许已认证用户修改自己的个人信息，如姓名、头像等非敏感数据。

## mermaid 流程图

```mermaid
flowchart TD
    A[接收更新请求] --> B[认证中间件验证]
    B --> C{认证是否通过?}
    C -->|失败| D[返回认证错误]
    C -->|通过| E[参数验证]
    E --> F{参数是否有效?}
    F -->|无效| G[返回参数错误]
    F -->|有效| H[获取用户ID和角色]
    H --> I{检查用户是否存在?}
    I -->|不存在| L2[返回用户不存在]
    I -->|存在| J[根据角色更新对应表]
    J --> K{更新是否成功?}
    K -->|失败| L3[返回更新失败]
    K -->|成功| L[返回更新结果]

    style A fill:#e1f5fe
    style L fill:#4caf50
    style D fill:#f44336
    style G fill:#f44336
    style L2 fill:#f44336
    style L3 fill:#f44336
```

## 接口信息

-   **路径**: `POST /v1/user/update`
-   **权限**: 需要认证
-   **Content-Type**: application/json

## 请求参数

| 参数名   | 类型   | 必填 | 说明                      |
| -------- | ------ | ---- | ------------------------- |
| realname | string | 否   | 真实姓名                  |
| nickname | string | 否   | 昵称                      |
| avatar   | string | 否   | 头像 URL                  |
| gender   | number | 否   | 性别 (0:未知，1:男，2:女) |
| age      | number | 否   | 年龄                      |
| province | string | 否   | 省份                      |
| city     | string | 否   | 城市                      |
| address  | string | 否   | 地址                      |
| email    | string | 否   | 邮箱地址                  |
| bio      | string | 否   | 个人简介                  |

## 请求示例

```json
{
    "realname": "张三",
    "nickname": "小张",
    "avatar": "https://example.com/avatar.jpg",
    "gender": 1,
    "age": 25,
    "province": "广东省",
    "city": "深圳市",
    "address": "南山区科技园",
    "email": "zhangsan@example.com",
    "bio": "个人简介"
}
```

## 响应格式

### 成功响应

```json
{
    "code": 10000,
    "message": null,
    "data": {
        "id": "user123",
        "name": "新姓名",
        "email": "user@example.com",
        "avatar": "https://example.com/avatar.jpg",
        "updated": "2024-12-26T10:08:12.000Z"
    }
}
```

### 错误响应

```json
{
    "code": 40001,
    "message": "参数验证失败",
    "data": null
}
```

## 错误代码

| 错误代码 | 说明             |
| -------- | ---------------- |
| 40001    | 参数验证失败     |
| 40101    | 认证失败         |
| 40102    | 令牌过期         |
| 50001    | 更新用户信息失败 |

## 依赖关系

-   [PocketBase 工具](mdc:src/utils/pocketbase.js.md) - 数据库操作
-   [认证中间件](mdc:src/middleware/auth.js.md) - 用户认证
-   [响应中间件](mdc:src/middleware/response.js.md) - 统一响应格式

## 安全考虑

1. **权限控制**: 用户只能更新自己的信息
2. **数据验证**: 对输入数据进行格式验证
3. **敏感信息**: 不允许更新邮箱、密码等敏感信息

## 使用示例

```bash
curl -X POST http://localhost:1337/v1/user/update \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "张三丰",
    "phone": "13800138000"
  }'
```

## 更新历史

| 版本 | 日期       | 说明                 |
| ---- | ---------- | -------------------- |
| 1.0  | 2024-12-26 | 创建更新用户信息接口 |
