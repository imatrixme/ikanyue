# Hono → Go 单元测试对照

Go 测试用 `// Hono: <文件名去掉 .test.js> › <用例标题>` 标注它承接的 Hono 用例，一条 Go 测试可以承接多条。下表列出不迁移的 Hono 测试文件和原因；“个别用例”列出 Go 没有对应写法的单条用例。其余 Hono 用例必须都有 Go 标注。

核对方式：比较 `ikanyue.mapi.hono` 下所有 `*.test.js` 的 `test(...)` / `it(...)` 标题和 `kanyue.server` 中 `*_test.go` 的 `// Hono:` 注释，再除去本文列出的文件和用例。`ikanyue.mapi.hono` 已于 2026-10-27 删除，核对时从删除前的提交读取（`git show <commit>:ikanyue.mapi.hono/test/<file>`）。2026-10-27 核对结果：107 个文件、563 条用例，未列出且无 Go 标注的为 0。

“接口已删除”指 Hono 上没有任何客户端（小程序、后台、官网）调用的接口，迁移时直接删除而不是移植：学员自助课程点接口 `/v1/course-credits/*`（含折算预览、折算执行与隐式折算预留）、活动报名、音视频素材、活动签到与课时记录。

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
| `courseBookingLocalSeed` | N/A | Hono 本地种子脚本；Go 用 `kanyue-server seed local`，见 `internal/devseed/devseed_test.go` |
| `courseBookingWorkerScript` | N/A | Hono 外部 worker 脚本；Go 改为进程内定时任务（D5） |
| `courseCreditConversionRollbackIntegration` | N/A | 接口已删除：学员折算执行与回滚 |
| `courseCreditConversionService` | N/A | 接口已删除：学员折算执行；后台折算规则管理已迁移，见 `conversion_rules_cases_test.go` |
| `pointsLiteBootstrap` | N/A | Hono 集合与管理员引导脚本；Go 用迁移（`migrations_test.go`）与 `seed local`（`devseed_test.go`） |
| `pageFacingActivitySignupRoutes` | N/A | 接口已删除：活动报名 |
| `courseCreditImplicitReservation` | N/A | 接口已删除：隐式折算预留走 `/v1/course-credits/*` |
| `courseCreditImplicitReservationIntegration` | N/A | 接口已删除：同上 |
| `courseCreditQueryService` | N/A | 接口已删除：学员课程点查询走 `/v1/course-credits/*`；Go 的学员视图见 `student_learning_cases_test.go` |
| `courseCreditStudentRoutes` | N/A | 接口已删除：同上，含折算预览与命令 |

## 个别用例不迁移

- `courseCreditConversion › active conversion rules use a half-open effective period`：接口已删除：`activeConversionRulesAt` 只服务于学员折算查询与预留；后台只用 `validateConversionRuleShape`，见 `conversion_rules_cases_test.go`
- `courseCreditConversion › target quantity rejects fractional, below-minimum, and above-maximum requests`：接口已删除：学员折算执行的目标数量校验
- `courseCreditConversion › all target expiry policies calculate explicit outcomes`：接口已删除：学员折算执行生成的目标批次到期
- `courseCreditConversion › target batch terms distinguish immediate and deferred activation`：接口已删除：同上，目标批次生效时间
- `courseCreditConversionRuleVersions › future and expired latest versions remain unavailable`：接口已删除：同 `activeConversionRulesAt`
- `pageFacingFindRoutes › audio material find route supports miniapp list, detail, and POST form params`：接口已删除：音视频素材
- `pageFacingFindRoutes › audio material find route covers validation and lookup failures`：同上
- `pageFacingFindRoutes › video material find route supports miniapp list, detail, and POST params`：同上
- `pageFacingFindRoutes › video material find route covers validation and lookup failures`：同上
- `pointsLiteCoverage › ops handlers cover status-only service errors and sendResult fallbacks`：Hono 用注入的 mock service 制造只有状态码的错误；Go 处理器直接调用领域函数、没有可注入的 service，错误信封统一由 `internal/httpx/envelope.go` 生成，各模块的错误信封断言在对应 handler 测试里
- `courseCreditCatalogIdempotency › credit types enforce universal and exact-course semantics`：`domain/catalog.js` 的这些校验只被已删除的学员折算服务使用
- `courseCreditCatalogIdempotency › package grant lines require unique positive integer quantities`：同上；Go 后台授予行校验见 `admin_cases_test.go`
- `courseCreditCatalogIdempotency › course entitlement changes require a new credit type while display metadata does not`：同上
- `courseCreditCatalogIdempotency › product classification distinguishes price-only changes from entitlement changes`：同上
- `courseCreditFeatureFlags › implicit conversion requires its own flag after reservation is enabled`：隐式折算随 `/v1/course-credits/*` 删除，`COURSE_CREDIT_IMPLICIT_CONVERSION_ENABLED` 不再存在
- `courseCreditReservationService › insufficient exact credit becomes conversion-required when an active rule can cover the gap`：接口已删除：学员自助预留 `reserveSessionCredit` 在 `/v1/course-credits/*` 下；Go 只移植了它和约课共用的预留规划
- `courseCreditReservationService › conversion availability skips capped and underfunded rules`：同上
- `courseCreditReservationService › reservation replay is stable and conflicting key reuse is rejected`：同上；约课确认的重放见 `booking_services_cases_test.go`
- `courseCreditReservationService › version conflict retries from fresh state and records insufficient status`：同上
- `courseCreditReservationService › activation race reloads the winning activation and does not emit ACTIVATE twice`：同上
- `courseCreditReservationService › same-request batch conflict returns the committed reservation replay`：同上
- `courseCreditReservationService › reservation preserves storage errors and validates command and session contracts`：同上

- `courseCreditManualAttendance › manual attendance constructor defaults remain callable`：Go 没有服务对象和可注入的 clock / idFactory
- `courseCreditRoutes › student reservation route derives student identity only from the authenticated token`：接口已删除：学员自助预留在 `/v1/course-credits/*`
- `courseCreditRoutes › course-credit service factories wire every Hono service to the SDK repository`：Hono 服务工厂装配；Go 没有服务工厂
- `opsLiteAuth › ops service factory exposes only light branch services`：同上
- `fileUrl › processAudioMaterialFiles maps string and object file fields`：接口已删除：音视频素材；活动列表只需 `getFileUrl`（`records.FileURL`），见 `activities_test.go`
- `fileUrl › processVideoMaterialFiles maps source, cover, and thumbnail URLs`：同上
- `fileUrl › processActivityFiles maps cover and image collections`：同上
- `fileUrl › processBatchFiles only maps arrays`：同上
- `recordMappers › mapAttendanceRecord maps defaults and expanded activity data`：接口已删除：活动签到、课时记录与活动报名；Go 只用 `resolveRelationId`（`relationID`）
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
- 运营登录（`opsLiteAuth`）：`parseJsonField` / `mapRecord` / `buildPagination` / `sanitizePrivateFields` 是积分轻量分支的工具函数，积分的可观察行为见 `internal/points/points_test.go`。
- 学员管理（`opsStudentAdmin`）：积分相关的学员排除逻辑随积分迁到 `internal/points`。
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
| `pointsLite` / `pointsLiteCoverage` | `internal/points/points_test.go`、`internal/activities/activities_test.go`、`internal/identity/ops_cases_test.go`、`internal/audit/audit_test.go`、`internal/server/server_test.go` |
| `pageFacingFindRoutes` | `internal/activities/activities_test.go` |
| `courseBookingBackfill` | `internal/coursecredit/backfill_cases_test.go` |
| `courseCreditMigration*` / `courseCreditShadow*` | `internal/coursecredit/migration_cases_test.go`、`shadow_cases_test.go` |
| `courseCreditConversion` / `courseCreditConversionRuleVersions` | `internal/coursecredit/conversion_rules_cases_test.go` |
| `courseCreditTeacherCreditService` / `courseCreditTeacherEarning` | `internal/coursecredit/teacher_credits_cases_test.go`、`teacher_earning_cases_test.go` |

