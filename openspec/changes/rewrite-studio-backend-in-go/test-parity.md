# Hono → Go 单元测试对照

Go 测试用 `// Hono: <文件名去掉 .test.js> › <用例标题>` 标注它承接的 Hono 用例，一条 Go 测试可以承接多条。下表列出不迁移的 Hono 测试文件和原因；“个别用例”列出 Go 没有对应写法的单条用例。其余 Hono 用例必须都有 Go 标注。

核对方式：比较 `ikanyue.mapi.hono` 下所有 `*.test.js` 的 `test(...)` / `it(...)` 标题和 `kanyue.server` 中 `*_test.go` 的 `// Hono:` 注释，再除去本文列出的文件和用例。

## 整个文件不迁移

| Hono 测试 | 状态 | 原因 |
|---|---|---|
| `courseCreditAppStartup` | N/A | Hono 启动装配；Go 在 `main.go` / `server` 包装配，见 `server_test.go` |
| `courseCreditStorageStartup` | N/A | Hono 选择 PocketBase / SDK 存储；Go 内嵌 PocketBase，没有存储切换 |
| `courseCreditNoPocketBaseHooks` | N/A | 约束 Hono 不在 PocketBase 钩子里写业务；Go 业务就在进程内事务里 |
| `courseCreditRepositories` | N/A | Hono 仓储抽象；Go 直接用 `core.App` |
| `courseCreditSdkBatchRepository` | N/A | Hono 通过 SDK batch 写库；Go 用 `RunInTransaction`，见 `spike/transaction_test.go` |
| `courseCreditSchema` | N/A | Hono 的集合定义脚本；Go 用迁移，见 `migrations_test.go` |
| `courseCreditPocketBaseAssets` | N/A | Hono 部署脚本拷贝 PocketBase 资源 |
| `courseCreditPocketBaseBackup` | N/A | Hono 备份脚本；不属于 Go 进程 |
| `courseCreditPocketBaseVerification` | N/A | Hono 对外部 PocketBase 的校验脚本 |
| `courseCreditPocketBaseBusinessIntegration` | N/A | 外部 PocketBase SDK batch 联调；Go 测试本身就跑在真实 PocketBase 上 |
| `courseCreditOpenApi` | N/A | Hono 的 OpenAPI 生成；Go 用 `kanyue.server/contract` 契约测试 |
| `routeBuilder` | N/A | Hono 路由封装；Go 对应 `Command` / `Query`，由各路由测试覆盖 |
| `response` | N/A | Hono 响应信封；Go 对应 `httpx` 信封，由各路由测试覆盖 |
| `opsRepository` | N/A | Hono 运营仓储抽象 |
| `opsSchema` | N/A | Hono 运营集合定义脚本 |
| `courseBookingLocalSeed` | N/A | Hono 本地种子脚本；Go 用 `native-stack.mjs init` |
| `courseBookingWorkerScript` | N/A | Hono 外部 worker 脚本；Go 改为进程内定时任务（D5） |
| `courseBookingBackfill` | N/A | 范围外：`/ops/course-bookings/backfill*` 继续由 Hono 提供 |
| `courseCreditMigrationPlan` | N/A | 范围外：迁移工具继续由 Hono 提供 |
| `courseCreditMigrationRoutes` | N/A | 范围外：同上 |
| `courseCreditMigrationService` | N/A | 范围外：同上 |
| `courseCreditShadowRoutes` | N/A | 范围外：影子对账继续由 Hono 提供 |
| `courseCreditShadowService` | N/A | 范围外：同上 |
| `courseCreditConversion` | N/A | 范围外：折算规则继续由 Hono 提供 |
| `courseCreditConversionRollbackIntegration` | N/A | 范围外：同上 |
| `courseCreditConversionRuleVersions` | N/A | 范围外：同上 |
| `courseCreditConversionService` | N/A | 范围外：同上 |
| `courseCreditTeacherCreditService` | N/A | 范围外：教师事件继续由 Hono 提供 |
| `courseCreditTeacherEarning` | N/A | 范围外：同上 |
| `pointsLite` | N/A | 范围外：积分继续由 Hono 提供 |
| `pointsLiteBootstrap` | N/A | 范围外：同上 |
| `pointsLiteCoverage` | N/A | 范围外：同上 |
| `pageFacingActivitySignupRoutes` | N/A | 范围外：活动报名继续由 Hono 提供 |
| `pageFacingFindRoutes` | N/A | 范围外：活动与素材查询继续由 Hono 提供 |
| `courseCreditImplicitReservation` | N/A | 范围外：隐式折算预留走 `/v1/course-credits/*`，继续由 Hono 提供 |
| `courseCreditImplicitReservationIntegration` | N/A | 范围外：同上 |
| `courseCreditQueryService` | N/A | 范围外：学员课程点查询走 `/v1/course-credits/*`，继续由 Hono 提供；Go 的学员视图见 `student_learning_cases_test.go` |
| `courseCreditStudentRoutes` | N/A | 范围外：同上，含折算预览与命令 |

## 个别用例不迁移

- `courseCreditAdminResourceCommands › conversion publication creates immutable versions and rejects profitable graphs`：折算规则在范围外，继续由 Hono 提供
- `courseCreditCatalogIdempotency › credit types enforce universal and exact-course semantics`：`domain/catalog.js` 只被折算规则使用，范围外
- `courseCreditCatalogIdempotency › package grant lines require unique positive integer quantities`：同上；Go 后台授予行校验见 `admin_cases_test.go`
- `courseCreditCatalogIdempotency › course entitlement changes require a new credit type while display metadata does not`：同上
- `courseCreditCatalogIdempotency › product classification distinguishes price-only changes from entitlement changes`：同上
- `courseCreditFeatureFlags › implicit conversion requires its own flag after reservation is enabled`：折算开关只在 Hono
- `courseCreditReservationService › insufficient exact credit becomes conversion-required when an active rule can cover the gap`：学员自助预留 `reserveSessionCredit` 在 `/v1/course-credits/*` 下，继续由 Hono 提供；Go 只移植了它和约课共用的预留规划
- `courseCreditReservationService › conversion availability skips capped and underfunded rules`：同上
- `courseCreditReservationService › reservation replay is stable and conflicting key reuse is rejected`：同上；约课确认的重放见 `booking_services_cases_test.go`
- `courseCreditReservationService › version conflict retries from fresh state and records insufficient status`：同上
- `courseCreditReservationService › activation race reloads the winning activation and does not emit ACTIVATE twice`：同上
- `courseCreditReservationService › same-request batch conflict returns the committed reservation replay`：同上
- `courseCreditReservationService › reservation preserves storage errors and validates command and session contracts`：同上

- `courseCreditManualAttendance › manual attendance constructor defaults remain callable`：Go 没有服务对象和可注入的 clock / idFactory
- `courseCreditOpsQueryService › teacher workload queues hide resolved earnings and paginate confirmed events`：教师事件查询在范围外，继续由 Hono 提供
- `courseCreditOpsQueryService › teacher event detail is restricted to the current teacher outside admin scope`：同上
- `courseCreditRoutes › student reservation route derives student identity only from the authenticated token`：学员自助预留在 `/v1/course-credits/*`，继续由 Hono 提供
- `courseCreditRoutes › course-credit service factories wire every Hono service to the SDK repository`：Hono 服务工厂装配；Go 没有服务工厂
- `opsLiteAuth › ops service factory exposes only light branch services`：同上
- `fileUrl › processAudioMaterialFiles maps string and object file fields`：素材与活动在范围外，继续由 Hono 提供；Go 只用 `getFileUrl`（`records.FileURL`）
- `fileUrl › processVideoMaterialFiles maps source, cover, and thumbnail URLs`：同上
- `fileUrl › processActivityFiles maps cover and image collections`：同上
- `fileUrl › processBatchFiles only maps arrays`：同上
- `recordMappers › mapAttendanceRecord maps defaults and expanded activity data`：活动签到、课时记录与活动报名在范围外，继续由 Hono 提供；Go 只用 `resolveRelationId`（`relationID`）
- `recordMappers › mapLessonRecord embeds attendance details when attendance is expanded`：同上
- `recordMappers › mapActivitySignupRecord maps activity expansion with file URLs and defaults`：同上
- `recordMappers › mapAttendanceRecord maps expanded lessons and supports disabling lesson embedding`：同上
- `recordMappers › record mappers return null for empty records and map inline attendance records`：同上
- `recordMappers › mapActivitySignupRecord handles camelCase activity fields and missing expansion`：同上

## 已迁移用例里的差异

Hono 用 mock 断言的部分子项在 Go 里没有对应物，Go 测试只保留可观察的行为：

- 预留改期规划（`courseCreditReschedulePlanning`）：`SESSION_START_INVALID` / `RESCHEDULE_TIME_INVALID` 由调用方以 `SESSION_TIME_INVALID` 拒绝；Go 没有 idFactory。
- 课节发布（`courseCreditSessionPublication`）：`uniqueIds` / `isNonEmptyObject` / `validatePublicationInput` / `validateClasses` 在 Go 里是内联校验，由发布命令测试覆盖。
- 学员学习路由（`courseCreditStudentLearningRoutes`）：Go 没有惰性加载服务，“before loading services” 体现为非学员直接 403。
- 对账（`courseCreditReconciliation`）：`reconstructBatch(null)` 在 Go 里不可达。
- 运营登录（`opsLiteAuth`）：`parseJsonField` / `mapRecord` / `buildPagination` / `sanitizePrivateFields` 是积分轻量分支的工具函数，积分留在 Hono。
- 学员管理（`opsStudentAdmin`）：积分相关的学员排除逻辑留在 Hono。
- 页面用户路由（`pageFacingUserRoutes`）：教师是 auth 集合，密码哈希不会到达业务代码，Hono 的旧 MD5 分支在生产上不会触发；Go 只校验 PocketBase 认证。头像数组与数字头像是 SDK mock 形态，真实字段为文本。
- 微信登录（`wechatLogin*`）：Hono 的 409 状态错误在 Go 里表现为直接写库的唯一约束错误；已有学员的 `gender` / `age` 不覆盖（数字字段总有值，Hono 对真实 PocketBase 也不会覆盖），表单原值保存在 `wechatUserInfo`。

## Go 测试位置

| Hono 测试 | Go 测试 |
|---|---|
| 其余 `courseCredit*` / `courseBooking*` / `courseCalendar*` / `commerce*` | `internal/coursecredit/*_cases_test.go`、`coursecredit_test.go` |
| `courseBookingWechatIdentity` / `courseBookingWechatRoleRoutes` | `internal/identity/principal_cases_test.go`、`identity_test.go` |
| `wechatLoginCore` / `wechatLoginFailures` / `wechatLoginForms` / `wechatLoginRecovery` | `internal/identity/wechat_login_cases_test.go` |
| `pageFacingUserRoutes` | `internal/identity/user_cases_test.go` |
| `opsLiteAuth` | `internal/identity/ops_cases_test.go` |
| `opsStudentAdmin` | `internal/students/students_test.go`、`students_cases_test.go` |
| `opsVenues` | `internal/venues/venues_cases_test.go`、`internal/migrations/migrations_test.go` |
| `fileUrl` | `internal/records/records_test.go` |
| `recordMappers` / `pocketbaseTimeFilterGuard` | `internal/coursecredit/filter_time_cases_test.go` |
| `courseCreditPublicCatalog` | `internal/catalog/catalog_test.go`、`catalog_cases_test.go` |
| `courseCreditFeatureFlags` | `internal/coursecredit/feature_cases_test.go`、`internal/config/config_test.go` |

