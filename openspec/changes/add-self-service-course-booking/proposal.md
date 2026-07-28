## Why

学员当前只能查看管理员已经安排的课程，拥有剩余课时时仍需线下沟通排课；教师也缺少在小程序中维护可预约时间和确认预约的工作台。需要在现有课程、课时预留、课堂核销和教师工作量体系上增加一套并发安全的自助预约能力，同时继续对学员隐藏课程点账本概念。

## What Changes

- 学员可以针对自己仍有可用课时的具体课程查看教师与可预约时段，并提交、撤回或取消预约。
- 教师可以在同一微信小程序中查看待确认预约、确认或拒绝申请，并维护每周可预约时间与日期例外。
- 教师确认预约时，Hono 在一个 PocketBase SDK Batch 中完成时间占位、正式课堂创建、学员课时预留、教师分配、预约状态、审计与 Outbox。
- 新增数据库唯一约束支持的离散日历占位，防止学员预约与 Admin 排课在并发条件下重复占用教师或学员时间。
- Admin 增加预约管理工作区，用于查看待处理队列、配置预约规则与教师课程资格、处理取消和冲突；已确认预约继续进入现有课堂与核销流程。
- 微信身份登录支持已审核教师绑定和多角色选择，教师不得通过微信登录自动注册。
- 默认可预约时间采用 `Asia/Shanghai` 的上午 09:00-11:00、下午 14:00-19:00；提前预约、预约期限和取消规则均由版本化策略配置。
- Hono、Admin 和小程序继续独立执行 lines、branches、functions、statements 95% 覆盖率门禁。

## Capabilities

### New Capabilities

- `course-booking`: 覆盖预约资格、教师可用时间、请求状态机、并发占位、正式课堂物化、课时预留、取消改期和通知。
- `teacher-miniapp-experience`: 覆盖教师微信身份、小程序角色化导航、预约确认、教学日历和可预约时间维护。

### Modified Capabilities

- `ops-admin-system`: 增加预约运营、教师课程资格、预约规则和冲突处理的角色与 capability 约束工作流。
- `miniapp-page-api-unit-coverage`: 增加学员和教师预约页面、角色边界、自然课程术语与编译产物契约覆盖。
- `subproject-unit-test-coverage`: 将预约事务、并发冲突和三端交互纳入独立 95% 覆盖率门禁。

## Impact

- `ikanyue.mapi.hono`: 新增 PocketBase migrations、预约领域服务、学员/教师/Admin API、身份绑定、日历占位、Outbox 和 OpenAPI。
- `ikanyue.taro3`: 新增角色化 TabBar、学员预约流程、教师工作台、预约详情和可预约时间页面，并复用现有 design token 与 imagegen 图标风格。
- `ikanyue.admin`: 新增 `/appointments` 工作区、预约规则和教师可用时间管理，并让现有课堂生命周期统一维护时间占位。
- 根项目仅保存 OpenSpec 和架构证据，不增加 JavaScript 依赖；官网、Flutter、支付和扫码签到不在本次范围内。
