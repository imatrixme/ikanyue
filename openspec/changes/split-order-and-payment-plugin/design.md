## Context

现状（`kanyue.server/internal/coursecredit`）：

- 核心已经有 `orders`（订单号、学员、渠道、标价、实付、价格版本、商品与发放快照），后台手工报名就用它；
- 线上购买在 `commerce_*`（约 2300 行）：
  - `commerce_orders.data` 同时装着商品订单信息（可售条目、退款规则、每行分摊、已退、预留待退、取消扣费、发放结果）和支付信息（支付单号、付款人、网关状态）；
  - `commerce_refunds` 同时装着退款单（金额、扣费、类型、预约、暂扣课时）和退款执行状态（网关退款号、重试次数）；
  - 支付模块直接写核心的 `orders`、`credit_batches`、`credit_events`、`credit_operations`；
- 核心的 `cancelAppointment` / `previewCancellation` 调用 `reservationQuote` / `cashCancellationPlan`，直接读写 `commerce_orders`、`commerce_refunds`、`commerce_claims`、`commerce_audit`。这是核心依赖插件。

## Goals / Non-Goals

- Goals：
  - 与货品订单有关的一切属于订单中心（核心），没开通支付的租户也能用；
  - 支付插件只处理钱：支付流水、退款流水、结果查询、回调、对账、资金异常；
  - 插件只调用订单中心导出的命令；
  - 插件到期、收尾、停用都不会卡住钱和课时；
  - 对外接口和行为不变。
- Non-Goals：营销优惠、线下订单界面、服务商模式，见 proposal。

## Decisions

### 1. 边界：订单中心管货，支付插件管钱

| 概念 | 归属 | 数据 |
|---|---|---|
| 可售条目（课包 + 价格版本 + 退款与取消规则） | 订单中心 | `offers`（原 `commerce_offers`） |
| 商品订单：买了什么、标价、应付、实付、每行分摊、规则、已退 / 待退 / 取消扣费、结算方式、履约结果 | 订单中心 | `orders`（扩展字段） |
| 退款单：退什么、应退多少、扣费、暂扣哪些课时、状态、结算方式 | 订单中心 | `order_refunds`（新） |
| 课时发放、回收、冻结与恢复 | 订单中心调用课时台账 | `credit_*`（不变） |
| 支付流水：业务单号、金额、币种、付款人、网关支付号、状态、到账时间 | 支付插件 | `payment_transactions`（新，来自 `commerce_orders` 的支付部分） |
| 退款流水：业务退款单号、原支付流水、金额、网关退款号、状态、重试 | 支付插件 | `refund_transactions`（新，来自 `commerce_refunds` 的执行部分） |
| 订单并发声明、订单审计（下单、退款申请、取消、重试退款等） | 订单中心 | `order_claims` / `order_audit`（原 `commerce_claims` / `commerce_audit` 改名） |
| 资金异常工单、插件并发声明、资金审计（补偿请求、异常复核） | 支付插件 | `payment_cases`（原 `commerce_cases` 改名）、`payment_claims` / `payment_audit`（新） |
| 对账单、补偿工单 | 支付插件 | 透传 `kanyue.pay`（不变） |

判断规则：这件事离开「钱」还有没有意义？有意义的就属于订单中心，比如买了什么、取消一节课应退多少、哪些课时要收回。只和钱的流动有关的就属于支付插件，比如发起支付、查询是否到账、执行退款、对账。

支付插件只认识「业务单号 + 金额」：支付流水的业务单号是订单号，退款流水的业务单号是退款单号。它不认识课包、课时和购买内容。

### 2. 路由归属（路径不变）

| 路由 | 归属 | 需要的插件能力 |
|---|---|---|
| `GET /v1/student/commerce/catalog` | 订单中心 | 发起支付 |
| `POST /v1/student/commerce/orders`（下单） | 订单中心 | 发起支付 |
| `GET /v1/student/commerce/orders`、`GET …/orders/{id}` | 订单中心 | 无 |
| `GET …/orders/{id}/refund-preview`、`POST …/orders/{id}/refunds` | 订单中心 | 无 |
| `GET /v1/student/commerce/refunds/{id}` | 订单中心 | 无 |
| `GET /ops/commerce/orders`、`GET …/orders/{id}`、`POST …/orders/{id}/refunds` | 订单中心 | 无 |
| `/ops/commerce/offers*` | 订单中心 | 无 |
| `POST …/orders/{id}/cashier`（发起支付） | 支付插件 | 发起支付 |
| `POST …/orders/{id}/refresh`（查询支付结果） | 支付插件 | 资金收尾 |
| `POST …/orders/{id}/mock-pay`、`POST /ops/commerce/refunds/{id}/mock-success` | 支付插件（仅 mock 环境） | 资金收尾 |
| `POST /internal/commerce/payment-events`（回调） | 支付插件 | 资金收尾 |
| `GET /ops/commerce/finance`、`POST …/reconcile`、`POST …/recover`、`POST …/orders/{id}/recover`（同步该单支付与退款）、`POST …/refunds/{id}/retry` | 支付插件 | 资金收尾 |
| `/ops/commerce/cases*`、`/ops/commerce/statements*`、`/ops/commerce/statement-lines*`、`/ops/commerce/recovery-work*` | 支付插件 | 资金收尾 |

「无」表示订单中心的路由不受插件状态影响：插件停用后，学员仍能查看订单和退款单；退款单按线下结算处理。
「发起支付」只在插件启用期可用。「资金收尾」在启用期和收尾期都可用。

### 3. 订单中心导出给支付插件的命令

都幂等，在一个事务里完成，只读写核心数据（`coursecredit/orders_payment.go`）：

- `PayableOrder(orderID)`：应付金额、币种、付款人、订单状态和学员，供发起支付时使用；
- `OrderPaid(orderID, paymentRef, amount, paidAt)`：核对金额等于 `productSnapshot.paidMinor` 后登记支付成功并履约（发放课时），不一致返回 `PAYMENT_RECEIPT_MISMATCH`；已履约的重复调用直接成功；
- `OrderPaymentFailed(orderID)`：待支付订单登记为失败；
- `OnlineRefunds(statuses...)` / `RefundOf(refundID)`：列出或读取结算方式为 `online` 的退款单；
- `RefundSucceeded(refundID, ref)`：登记退款成功，暂扣的课时正式收回；
- `RefundFailed(refundID, ref)`：登记退款失败；整单退款恢复暂扣课时，预约退款保留为待退（负债）；
- `ReopenRefund(refundID, actor)`：财务重试失败的线上预约退款，退款单回到「退款中」并记订单审计；
- `OrderSummaries(orderIDs)`：按业务单号批量查询名称、学员、状态，供资金页和异常工单展示；
- `StudentOrderView` / `OpsOrderView` / `RefundView`：插件路由（收银台、查询、补偿、mock）返回与订单中心相同的视图，响应格式不变。

插件只在核心命令成功后才把自己的流水标为终态，所以在两者之间崩溃时，补偿任务会重新调用并靠幂等补齐。

预约取消（`previewCancellation` / `cancelAppointment`）改为读订单中心的规则和分摊，在订单中心生成退款单，不再接触任何支付数据。

所有方向都是「插件 → 订单中心」：

- 发起支付：下单本身不创建支付。插件的补偿任务取 `UnpaidOrders`，在启用期为还没有支付的订单开单（先写支付流水再调用网关，网关按订单号幂等），收银台复用这笔支付并返回收银台参数（补偿任务还没跑到时由收银台开单）。kanyue.pay 的支付窗口从创建支付起固定 30 分钟（`PaymentWindow`），提前开单使它与下单时间对齐，和小程序「下单后 30 分钟内完成支付」的承诺一致；超过窗口仍没有支付的订单由补偿任务或收银台调用 `OrderPaymentFailed` 关闭；
- 到账：插件通过回调或查询确认网关状态后，调用 `OrderPaid` 或 `OrderPaymentFailed`；
- 退款：订单中心生成退款单（状态「退款中」）；插件的补偿任务（每 3 秒）、按单同步或 mock 成功时取 `OnlineRefunds("processing")`，创建退款流水并在网关执行，再调用 `RefundSucceeded` 或 `RefundFailed`。第一次尝试的网关业务号就是退款单号，重试用 `hash("refund-retry", refundID, attempt)`。

### 4. 包结构与静态边界

- `internal/coursecredit`：核心，新增订单中心 `orders_*.go`（下单、履约、退款单、取消报价、订单查询、可售条目和上面的导出命令）；
- `internal/plugins/payment`：支付插件，包括网关客户端、收银台、支付结果查询、回调、退款执行、补偿任务、资金总览、对账单透传、资金异常工单；
- 插件只使用已导出的通用工具（错误信封 `Fail`、请求体 `ReadJSONBody` / `ValidateReason`、权限常量 `Finance` 等），不为插件导出核心内部的 `get` / `send` 等数据访问函数；插件读写自己的集合时直接用 `e.App`（已是租户范围）；
- 静态检查：
  - 核心包不能 import `internal/plugins/...`；
  - 插件包里不能出现核心集合名（`orders`、`order_refunds`、`offers`、`credit_*`、`students` 等），只能通过订单中心命令访问。

### 5. 插件三态与按能力开放路由

- `tenant_plugins` 增加 `expiresAt`；`status` 取值改为 `active` / `winding_down` / `disabled`；
- 有效状态：`disabled` → 停用；`winding_down` 或已过 `expiresAt` → 收尾；否则启用；
- 路由声明需要的插件能力：
  - 「发起支付」：仅启用期可用；
  - 「资金收尾」：启用期和收尾期可用；
- 声明方式是路由级中间件：`router.X(...).BindFunc(tenancy.Needs(tenancy.Payment, tenancy.StartPayment))`，订单中心的 catalog / 下单也这样声明，不需要调用插件代码；服务装配只负责把请求限定到租户；
- 不满足时返回 404 信封（「接口不存在」），与现在的插件开关一致；
- 平台总开关 `platform_plugins`（每个插件一行，`paused`、`note`）：`paused` 为真时所有租户都没有「发起支付」能力，「资金收尾」不受影响；
- 定时任务：支付补偿和退款执行在启用期和收尾期运行，停用时不运行；
- 停用时（`tenancy.OnPluginDisabled` 钩子，由订单中心注册，与状态切换同一事务）：
  - 还有 `online` 的「退款中」退款单时拒绝停用（`PAYMENT_REFUNDS_IN_FLIGHT`）：它们可能已发到网关，转线下会重复退款；先设为收尾，插件会执行完；
  - 还有订单在支付窗口内时拒绝停用（`PAYMENT_ORDERS_OPEN`）：学员仍可能付款，停用后到账没人记账；收尾期不能再下单，30 分钟后窗口全部结束；已超窗的待付订单在停用时关闭；
  - 否则把 `online` 的失败预约退款（仍欠学员）转为 `offline` 的「退款中」，由老板线下处理；核心数据完整保留。

### 6. 迁移 `kanyue_0008_order_payment_split`

1. 改名（保留数据和 id）：`commerce_offers` → `offers`，`commerce_claims` → `order_claims`，`commerce_audit` → `order_audit`，`commerce_cases` → `payment_cases`；目标已存在且旧集合为空时直接删除旧集合（未登记迁移就重建了基线的库），两边都有数据则报错停下；
2. `orders` 增加字段：`settlement`、`payerOpenId`、`refundedMinor`、`refundReservedMinor`、`pendingRefundCount`、`cancellationFeeMinor`、`paymentRef`；可售条目、规则、分摊和实付写进 `productSnapshot`（`offerId`、`offerName`、`policy`、`allocations`、`paidMinor`）；履约结果仍在 `credit_operations`（`type=grant`、`sourceType=order`）；
3. 新建 `order_refunds`、`payment_transactions`、`refund_transactions`、`payment_claims`、`payment_audit`；
4. 逐条转换已有的 `commerce_orders` / `commerce_refunds`：商品订单部分写入 `orders` / `order_refunds`，钱的部分写入 `payment_transactions` / `refund_transactions`（行 id 由来源派生，重跑不重复）；「履约中」的订单支付流水保持 `pending`，由插件补偿完成；`order_audit` 里的补偿请求与异常复核移到 `payment_audit`；其余订单记为 `offline`；
5. 删除 `commerce_orders`、`commerce_refunds`；
6. `tenant_plugins` 增加 `expiresAt`，`status` 增加 `winding_down`；新建 `platform_plugins`（由 `tenancy.EnsureSchema` 完成）。

所有新集合带 `tenant`，与一期规则一致。

### 7. 网关策略组

`kanyue.gateway/internal/exposure/mapi.json` 把 `POST …/orders/{id}/cashier` 和 `POST …/orders/{id}/refresh` 单独成批，挂策略组 `payment`，平台可以在网关层单独限流或停用支付入口。一个域名只能绑定一个 API 分组，所以不拆独立分组。`exposure apply` 遇到不存在的策略组会整体失败，因此应用前先在控制台建好 `payment`（可以为空）。

## Risks / Trade-offs

- **资金逻辑在搬家时出错**：这是最大的风险。缓解办法：
  - 先把现有 commerce 测试按「订单中心 / 支付插件」拆开，断言保持不变，再搬代码；
  - `commerce-smoke --tiered`（下单、到账、阶梯取消、退款失败恢复、网关重启补偿、对账）作为端到端证据，原样通过；
  - 迁移在生产备份副本上演练。
- **支付成功和履约之间的一致性**：原来到账和发放课时在同一处代码；拆分后，插件确认到账后调用 `OrderPaid`，由订单中心在一个事务里登记并履约。插件崩溃在两者之间时，补偿任务重新查询支付结果并再次调用 `OrderPaid`，靠幂等保证只履约一次。
- **金额不一致**：`OrderPaid` 核对支付金额与应付金额，不一致时不履约，并由插件建资金异常工单。
- **能力标错**：会导致到期后学员不能退款，或者收尾期还能下单。用测试覆盖「到期后能查询和退款、能收回调，但不能下单和发起支付」。
- **工作量**：主要在约 2300 行支付代码的拆分和 1000 行测试的迁移；接口和前端不动。
- **退款改为异步执行**：退款申请先返回「退款中」，最多一个补偿周期（3 秒）后才发到网关；学员看到的状态与之前的最终结果一致。
- **停用与新退款并发**：退款单的结算方式在报价时决定，写入时（`order_refunds` 创建钩子，与写入同一事务）按插件当前状态再核一次；PocketBase 的写事务串行执行，所以停用守卫和退款写入不会交错：要么退款先写入、停用被拒，要么停用先生效、退款按线下记账。
- **补偿任务为每笔新订单在网关开单**：与拆分前下单即开单的行为一致；学员放弃的订单也会在网关留下一笔到期关闭的支付。
- **运营订单详情不再实时查询网关**：`paymentUnavailable` 恒为 false；需要核实时用「同步」按钮（`orders/{id}/recover`）。
- **资金审计不在订单详情里显示**：补偿请求、异常复核记在 `payment_audit`，订单详情只显示订单审计。
- **多租户开放支付前需要处理**：补偿任务会确认网关上没有本地流水的事件；目前只有默认租户有支付，开放多租户支付前要按租户区分网关事件。

## Migration Plan

1. 备份 `pb_data`，在副本上执行 `kanyue_0008_order_payment_split`；
2. 在副本上运行契约测试和 `commerce-smoke --tiered`；
3. 生产执行；回滚就是恢复备份并使用旧版本二进制。

## Open Questions

- 无。线下结算的老板界面放到老板工作台阶段。
