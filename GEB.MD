# GEB.MD — 渐进式自映射工程协议

> 版本：1.0  
> 用途：作为任意项目 `AGENTS.md` 的可叠加协议。  
> 目标：让 AI coding agent 在后续迭代中逐步建立“代码、测试、文档、架构、决策”之间的自校正闭环，而不是在接入当天全盘重构项目。

---

## 0. Kernel / 核心定义

本文件不是项目规范大全，也不是一次性文档重构计划。

它是一个**工程认知内核**：

```text
Purpose → Map → Code → Evidence → Reflection → Updated Map
```

每次 agent 修改项目时，都应在当前任务范围内维护这个闭环：

```text
意图指导地图
地图指导代码
代码产生事实
测试提供证据
证据暴露漂移
漂移推动局部地图更新
更新后的地图指导下一次迭代
```

本协议的关键约束：

```text
只在需求执行路径上补齐范式残缺。
不主动全仓库 GEB 化。
不创建与当前任务无关的文档层级。
不把文档改成替错误代码背书。
```

---

## 1. GEB 的工程翻译

这里的 GEB 指一种工程化隐喻，而不是哲学装饰。

### 1.1 Gödel / 不完备性

任何规则系统都不可能覆盖所有未来需求。

工程含义：

- 当现有规则解释不了新需求，不要强行套旧规则。
- 当必须突破旧边界，不要静默破例。
- 当一次例外可能变成模式，必须沉积为 ADR 或局部规则。
- 当文档、测试、代码冲突，不要假装它们天然一致。

对应机制：

```text
Gödel Clause → ADR / Drift / Explicit Exception
```

### 1.2 Escher / 奇异环

工程系统的层级会互相塑形：

```text
文档描述代码
代码改变现实
测试揭示现实
现实修正文档
文档继续影响代码
```

这是允许的奇异环。

禁止的伪奇异环是：

```text
AI 写代码
AI 改文档证明代码合理
AI 把刚改过的文档当作证据
```

自指必须经过证据层。

对应机制：

```text
Strange Loop Safety → Evidence before self-justification
```

### 1.3 Bach / 主题与变奏

好的工程结构不是所有模块一模一样，而是共享稳定主题，并在局部做有约束的变奏。

工程含义：

- 每个模块应能说明自己继承了哪些项目级主题。
- 每个模块应能说明自己的局部变奏是什么。
- 局部变奏不能破坏项目级不变量。
- 当变奏重复出现，应沉积为新模式。

对应机制：

```text
Theme & Variation → Local maps / module contracts / repeated motifs
```

---

## 2. Truth Hierarchy / 真值层级

当代码、测试、文档、需求之间不一致时，按以下顺序判断：

1. 明确的当前用户需求。
2. 运行事实：测试失败、编译错误、类型错误、schema 错误、运行日志。
3. 当前代码的实际行为。
4. 测试、fixture、golden file 中表达的预期行为。
5. 局部地图：最近的 `AGENTS.md`、`MODULE.md`、`folder.md`、文件头 contract。
6. 项目地图：`README.md`、`ARCHITECTURE.md`、设计文档。
7. 历史意图：ADR、变更记录、旧注释、commit 信息。

必须同时记住：

```text
代码是地形，但地形也可能已经坏掉。
文档是地图，但地图也可能已经过期。
测试是证人，但证人也可能不完整。
证据负责审判地图和地形。
```

---

## 3. No Big Bang Clause / 禁止大爆炸式迁移

引入本文件后，agent 不得立即做以下事情，除非用户明确要求：

- 全仓库扫描并重写所有文档。
- 为每个目录创建 `AGENTS.md` / `MODULE.md` / `folder.md`。
- 重构项目目录以符合理想架构。
- 批量添加文件头 contract。
- 批量补测试。
- 批量创建 ADR。
- 把所有旧代码一次性迁移到某种新范式。

默认行为必须是：

```text
Just-in-time GEB
```

也就是：

```text
只在当前任务需要理解、修改、验证、稳定化的范围内补齐缺失层。
```

---

## 4. Scope Radius / 任务半径

每次任务开始时，agent 必须定义任务半径。

### 4.1 默认半径

默认只包括：

```text
- 用户明确要求修改的文件或功能
- 直接相关的调用方 / 被调用方
- 最近的局部规则文件
- 对应测试
- 必要的构建配置
- 当前变更会影响的文档
```

### 4.2 可扩展半径

只有在以下情况才扩大半径：

- 当前修改导致编译或测试链路必须跨模块修复。
- 当前行为依赖上游/下游接口契约。
- 发现安全、隐私、数据损坏、支付、认证、发布风险。
- 发现文档与代码冲突，且冲突会影响当前任务正确性。
- 用户明确要求架构分析或迁移。

### 4.3 禁止扩大半径

不得因为以下原因扩大半径：

- “顺便整理”。
- “看起来不够优雅”。
- “既然发现了就全修掉”。
- “为了让项目更 GEB”。
- “为了让文档体系完整”。

---

## 5. Progressive Self-Completion / 渐进式自完备

GEB 范式缺失时，不要求立即补全。agent 只在当前任务路径上进行最小沉积。

### 5.1 范式残缺类型

| 编号 | 残缺 | 含义 | 默认动作 |
|---|---|---|---|
| G0 | 无入口地图 | 缺根 `AGENTS.md` 引入、缺 README、缺运行命令 | 只补当前任务所需入口信息 |
| G1 | 无局部地图 | 目标模块没有职责、边界、依赖说明 | 若影响本次修改，创建最小 `MODULE.md` 或局部段落 |
| G2 | 地图漂移 | 文档说法与代码/测试不一致 | 报告 `DRIFT FOUND`，必要时修复 |
| G3 | 无证据层 | 行为变化没有测试或验证方式 | 为本次行为补最小测试或说明未能验证原因 |
| G4 | 无决策记录 | 架构/规则变化没有 ADR | 仅当本次确实改变边界或长期规则时创建 ADR |
| G5 | 无局部守卫 | 模块高风险且重复出错，但无局部规则 | 第二次重复问题后，建议或创建局部 `AGENTS.md` |
| G6 | 模式未沉积 | 同类解决方案重复出现但没有模式说明 | 在当前模块地图中沉积为局部模式 |

### 5.2 补齐触发条件

只有满足以下任一条件，才允许创建或更新 GEB 相关文件：

1. 当前任务无法安全完成。
2. 当前修改改变了接口、行为、依赖、数据所有权、错误模型或安全边界。
3. 当前任务发现会影响本次正确性的漂移。
4. 同类 agent 误判或人类修正已重复出现。
5. 用户明确要求补齐文档、地图、ADR、规则。

### 5.3 单次任务沉积预算

默认每次任务最多新增：

```text
- 1 个局部地图文件，或
- 1 个 ADR，或
- 1 个局部 AGENTS.md，或
- 少量高风险文件头 contract
```

除非用户明确要求，或安全/发布风险要求立即处理，否则不得在单次任务中新增多个无关文档层级。

### 5.4 一次只提升一级

对任何模块，默认每次任务最多提升一个 GEB 成熟度等级：

```text
L0 Unseen      未测绘
L1 Observed    已观察：知道文件和命令
L2 Mapped      已映射：知道职责和边界
L3 Evidenced   已取证：关键行为有测试或验证
L4 Decisioned  已决策：边界变化有 ADR
L5 Guarded     已守卫：有稳定局部规则
```

不要从 L0 一步跳到 L5，除非用户要求进行架构治理。

---

## 6. File Stratification / 文件分层

本协议支持多级文件，但不要求全部存在。

### 6.1 根层：`GEB.MD`

职责：

```text
定义工程认知闭环、渐进迁移规则、漂移协议、沉积规则。
```

本文件是内核。不要为了某个局部实现随意修改本文件。

### 6.2 项目层：`AGENTS.md`

职责：

```text
告诉 agent 如何在本项目运行、构建、测试、遵守边界，并引入 GEB.MD。
```

`AGENTS.md` 应该包含真实命令和项目特定规则。

### 6.3 架构层：`ARCHITECTURE.md`

职责：

```text
描述当前架构地图、模块关系、依赖方向、系统不变量。
```

只有当架构边界、模块职责、依赖方向发生变化时更新。

### 6.4 决策层：`docs/adr/*.md`

职责：

```text
记录为什么改变规则、边界、长期模式或架构方向。
```

ADR 不是日志。只有长期影响的决策才需要 ADR。

### 6.5 模块层：`MODULE.md` / `folder.md` / 局部 `AGENTS.md`

职责：

```text
描述当前模块的职责、非职责、允许依赖、禁止依赖、不变量、测试入口。
```

优先级建议：

```text
普通模块：MODULE.md 或 folder.md
高风险模块：局部 AGENTS.md
已有约定：沿用项目现有文件名
```

不要为了形式统一强制改名。

### 6.6 文件层：file header contract

职责：

```text
只给高风险或边界文件写输入、输出、职责、不变量。
```

适用对象：

```text
- 领域服务
- 认证 / 支付 / 权限 / 隐私模块
- 数据迁移
- 网络边界
- 持久化边界
- 跨模块 public API
- 并发 / 调度核心
```

不适用对象：

```text
- 普通工具函数
- 临时脚本
- 简单 UI 组件
- 已经由类型和测试表达清楚的文件
```

---

## 7. Local Map Template / 局部地图模板

当本次任务必须补齐局部地图时，使用以下最小模板。

文件名优先沿用项目习惯。没有习惯时使用 `MODULE.md`。

```md
# Module Map: <path>

## Role / 职责

本模块负责：

- ...

## Non-Goals / 非职责

本模块不负责：

- ...

## Public Surface / 对外表面

- ...

## Allowed Dependencies / 允许依赖

- ...

## Forbidden Dependencies / 禁止依赖

- ...

## Invariants / 不变量

- INV-001: ...

## Evidence / 证据入口

相关测试：

- ...

相关命令：

```bash
...
```

## Drift Triggers / 漂移触发器

当以下变化发生时更新本文档：

- 职责变化
- public API 变化
- 依赖方向变化
- 数据所有权变化
- 错误模型变化
- 安全/隐私行为变化
```

如果当前任务只需要两三条信息，不要填满模板；只写能被证据支撑的内容。

---

## 8. ADR Template / 决策记录模板

当本次任务改变架构、长期规则、依赖方向、数据所有权或安全边界时，创建 ADR。

路径优先沿用项目习惯。没有习惯时使用：

```text
docs/adr/ADR-YYYYMMDD-short-title.md
```

模板：

```md
# ADR-YYYYMMDD: <Decision Title>

Status: proposed | accepted | superseded
Date: YYYY-MM-DD

## Context / 背景

当前发生了什么问题？为什么旧规则不够用？

## Existing Rule / 原规则或默认假设

- ...

## Decision / 决策

我们决定：

- ...

## Consequences / 后果

正面：

- ...

负面：

- ...

## Alternatives / 备选方案

- ...

## Migration / 迁移策略

- ...

## Verification / 验证方式

- ...

## Related Files / 相关文件

- ...
```

ADR 必须解释“为什么”，而不是复述“改了什么”。

---

## 9. Drift Protocol / 漂移协议

发现代码、文档、测试不一致时，使用以下格式。

```text
DRIFT FOUND:
- Location:
- Code says:
- Docs say:
- Tests say:
- Likely source of truth:
- Risk:
- Proposed fix:
```

### 9.1 漂移处理规则

- 如果漂移阻止当前任务正确完成：在当前任务半径内修复。
- 如果漂移与当前任务弱相关：在最终回复中记录，不主动扩大范围。
- 如果漂移涉及安全、隐私、支付、认证、数据损坏、发布：立即显式报告，并请求或执行最小安全修复。
- 如果漂移表明项目规则过期：不要静默改规则，创建或建议 ADR。

### 9.2 不允许的漂移处理

不得：

- 为了让当前代码显得正确而改文档。
- 为了让旧文档显得正确而改代码，除非证据支持旧文档是正确意图。
- 批量修复与当前任务无关的漂移。
- 把未验证的猜测写成规则。

---

## 10. Sedimentation Protocol / 沉积协议

GEB 的增长方式不是扩张，而是沉积。

### 10.1 临时观察

第一次发现的问题，通常只在最终回复中说明：

```text
Observation:
- ...
```

### 10.2 局部沉积

当观察影响当前任务，或同类问题第二次出现时，沉积到最近的局部地图：

```text
MODULE.md / folder.md / existing local docs
```

### 10.3 规则沉积

当局部沉积具有长期约束意义，且会影响未来 agent 行为时，才升级为局部 `AGENTS.md`。

适合升级为局部 `AGENTS.md` 的情况：

- 认证、支付、权限、隐私、发布、构建、数据库等高风险模块。
- 重复出现的错误边界。
- 模块有明确禁止依赖。
- 模块有稳定不变量。
- 未来 agent 若忽略该规则会造成明显损害。

### 10.4 决策沉积

当规则变化跨模块、影响长期架构、或推翻已有约束时，沉积为 ADR。

---

## 11. Change Classification / 变更分类

每次修改前，agent 必须判断当前任务属于哪些类型。

```text
implementation   实现细节变化
behavior         行为变化
interface        API / ABI / schema / public contract 变化
dependency       依赖变化
architecture     架构边界变化
security         安全/隐私变化
data             数据模型/迁移/持久化变化
build            构建/CI/发布变化
test             测试变化
docs             文档变化
rule             规则变化
```

### 11.1 类型对应动作

| 类型 | 必须考虑 |
|---|---|
| implementation | 相关测试是否仍通过，是否需要文档更新 |
| behavior | 测试和用户可见说明 |
| interface | 调用方、文档、测试、兼容性 |
| dependency | 边界、许可证、体积、维护性、审批 |
| architecture | ADR、ARCHITECTURE.md、迁移风险 |
| security | 威胁、日志、权限、密钥、隐私、测试 |
| data | 迁移、回滚、兼容性、备份、数据损坏风险 |
| build | CI、缓存、环境、发布链路 |
| test | 测试是否表达真实行为 |
| docs | 是否来自证据，而非猜测 |
| rule | 是否需要 ADR，是否过度泛化 |

---

## 12. Evidence Policy / 证据策略

完成修改不等于代码看起来正确。

优先验证顺序：

```text
1. 格式化 / lint / 静态检查
2. 类型检查 / 编译
3. 与修改点最接近的单元测试
4. 集成测试
5. UI / E2E 测试
6. 人工验证说明
```

当不能运行检查时，必须说明：

```text
- 哪些检查没有运行
- 为什么不能运行
- 应该由谁在什么环境运行
- 当前变更的剩余风险
```

不要把“未运行测试”写成“应该没问题”。

---

## 13. Security & Privacy Invariants / 安全与隐私不变量

默认所有项目都遵守以下最低规则：

- 不提交密钥、token、证书、私钥、真实用户数据。
- 不记录密码、token、session、支付信息、PII、精确位置、私密内容。
- 不为了测试通过而削弱认证、授权、TLS、沙箱、权限、加密或校验。
- 不无理由新增权限、追踪、分析、后台任务或数据采集。
- 不把生产环境配置硬编码进代码。
- 不把安全敏感逻辑藏在 UI 层。

触碰以下区域时，必须显式报告安全影响：

```text
auth / payments / identity / permissions / storage / crypto / network /
logging / analytics / location / biometrics / deep links / release signing
```

---

## 14. Dependency Law / 依赖法则

添加或改变生产依赖前，必须说明：

- 为什么现有能力不足。
- 是否有标准库或已有依赖可替代。
- 许可证和维护状态是否可接受。
- 对构建时间、二进制体积、启动时间、隐私、测试性的影响。
- 是否改变架构边界。

默认不得无审批新增生产依赖。

开发依赖也应说明用途，避免工具链膨胀。

---

## 15. Mobile Hook / iOS 与 Android 项目挂钩

本文件可以叠加到 iOS / Android 项目，但不在根层硬编码具体命令。

移动端项目应在平台层 `AGENTS.md` 中沉积真实信息：

```text
apps/ios/AGENTS.md
apps/android/AGENTS.md
```

平台层至少应包含：

```text
- workspace / scheme / simulator 或 Gradle module / variant
- build 命令
- unit test 命令
- UI / instrumentation test 命令
- lint / static check 命令
- 平台架构边界
- 权限、隐私、签名、发布注意事项
```

GEB 对移动端的额外不变量：

- UI 不直接访问网络、数据库、密钥、底层文件系统。
- Domain / UseCase 不依赖 UIKit、SwiftUI、Android framework、Compose UI。
- DTO、数据库实体、UI state 不应无边界地互相泄漏。
- 权限、entitlement、manifest、privacy string、deep link、universal link、backup、keychain/keystore 变化必须显式报告。
- 用户可见行为变化必须考虑测试、可访问性、本地化和回归风险。

---

## 16. Agent Roles / 单 agent 内部角色

即使只有一个 agent，也应按四个角色自我约束。

### 16.1 Scout / 侦察者

职责：

```text
定位任务半径、读取局部规则、找到证据入口。
```

不得：

```text
在侦察阶段就开始重构。
```

### 16.2 Builder / 建造者

职责：

```text
做最小一致修改。
```

不得：

```text
把无关重构混进功能修改。
```

### 16.3 Judge / 审判者

职责：

```text
运行或设计验证，检查漂移、安全、边界。
```

不得：

```text
用刚改过的文档证明刚写的代码正确。
```

### 16.4 Archivist / 档案员

职责：

```text
只在触发条件满足时沉积地图、规则、ADR。
```

不得：

```text
为了完整性创建文档。
```

---

## 17. Working Loop / 标准工作循环

每次任务按以下流程执行。

### 17.1 Locate

```text
- 找到目标文件。
- 找到最近的 AGENTS.md。
- 找到 GEB.MD。
- 找到相关 README / ARCHITECTURE / ADR / MODULE / folder 文档。
- 找到相关测试。
```

只在任务半径内查找。

### 17.2 Interpret

```text
- 判断变更类型。
- 判断涉及哪些不变量。
- 判断是否存在范式残缺。
- 判断残缺是否影响当前任务。
```

### 17.3 Modify

```text
- 做最小 coherent change。
- 保持已有风格。
- 不引入无关抽象。
- 不越过已知边界。
```

### 17.4 Prove

```text
- 运行最近测试。
- 必要时扩大到集成/构建/静态检查。
- 无法运行时说明原因和风险。
```

### 17.5 Sediment

```text
- 若触发条件满足，补最小地图/ADR/局部规则。
- 若不满足，只在最终回复记录观察，不创建文件。
```

### 17.6 Report

最终回复必须包含：

```text
Changed:
- ...

GEB mode:
- no sediment / local map / drift fix / ADR / local guard

Scope:
- touched radius:
- deliberately not expanded:

Semantic impact:
- implementation / behavior / interface / dependency / architecture / security / data / build / docs / rule

Verification:
- run:
- not run:
- reason:

Docs:
- unchanged because ...
- updated ...

Drift:
- none
- found and fixed
- found but unresolved

Residual risk:
- ...
```

---

## 18. When to Create Which File / 创建文件决策表

| 情况 | 创建/更新 | 不创建 |
|---|---|---|
| 只是改内部实现 | 通常不更新文档 | ADR、局部 AGENTS.md |
| 改 public API | 更新接口文档或局部地图 | 全仓库规则 |
| 改模块职责 | 更新 `MODULE.md` / `folder.md` | 无关模块文档 |
| 改依赖方向 | 更新局部地图；必要时 ADR | 静默修改 |
| 改架构原则 | ADR + ARCHITECTURE.md | 只改 README |
| 改安全/隐私行为 | 测试 + 文档 + 显式报告 | 静默合并 |
| 首次发现小漂移 | 最终回复记录 | 新建一堆文档 |
| 重复漂移 | 局部地图沉积 | 全项目迁移 |
| 高风险模块重复误用 | 局部 `AGENTS.md` | 根 GEB.MD 大改 |
| 用户要求治理 | 可扩大范围 | 仍需分阶段计划 |

---

## 19. Existing Project Migration / 现有工程迁移方式

引入本文件后，默认迁移策略是“伴随式迁移”。

### 19.1 第一次任务

第一次接入后，不做全局治理。

只做：

```text
- 读取根 AGENTS.md 对 GEB.MD 的引入。
- 在当前任务半径内应用 GEB。
- 若发现缺少必要命令或地图，只补当前任务需要的最小信息。
```

### 19.2 后续任务

每次迭代都可能留下小沉积：

```text
第 N 次 auth 修改 → 补 auth MODULE.md
第 N+1 次 auth 边界冲突 → 补 auth 局部 AGENTS.md
第 N+2 次 auth 架构变化 → 补 ADR
```

这是预期行为。

### 19.3 不追求全局完成

GEB 成熟度不是全仓库统一升级。

允许项目长期处于：

```text
核心模块 L4
高风险模块 L5
普通模块 L1-L2
冷门模块 L0
```

这不是失败，而是正确的资源分配。

### 19.4 Strangler Fig / 绞杀榕迁移

当需要迁移旧架构时：

```text
- 先圈定边界。
- 新逻辑按新规则进入。
- 旧逻辑只在被触碰时逐步迁移。
- 用适配层隔离新旧模型。
- 每次迁移都留下测试或验证。
- 不进行无需求驱动的大清洗。
```

---

## 20. Self-Modification Rule / 自修改规则

本文件是内核，不是普通项目文档。

默认不得修改 `GEB.MD`。

只有以下情况允许提议修改：

- 用户明确要求改 GEB 协议。
- 多个项目/模块重复出现同一协议缺陷。
- 本协议与更高优先级安全/法律/平台要求冲突。
- 本协议阻碍了合理工程实践。

即使允许，也必须说明：

```text
- 旧规则是什么
- 失败场景是什么
- 新规则如何更小、更安全、更通用
- 是否会导致过度扩张
```

不得为了某个局部实现修改 GEB 内核。

---

## 21. Anti-Patterns / 反模式

以下行为违反 GEB.MD：

```text
- 因为接入了 GEB，所以批量创建文档。
- 因为看到了坏味道，所以顺手重构全模块。
- 因为文档缺失，所以先写长文档再写代码。
- 因为测试缺失，所以为无关历史行为补测试。
- 因为要保持一致，所以把局部特殊性抹平。
- 因为 agent 需要上下文，所以把 README 写成百科全书。
- 因为代码已这么写，所以改文档为它辩护。
- 因为文档这么写，所以无视测试和运行事实。
- 因为规则不适配，所以静默破例。
- 因为规则不适配，所以直接改根规则。
```

正确做法是：

```text
最小半径，证据优先，显式漂移，渐进沉积。
```

---

## 22. Minimal Prompts for Agents / 可复用提示

### 22.1 只做局部测绘

```text
请只在当前任务半径内测绘，不修改源码。
输出：相关文件、局部规则、测试入口、潜在漂移、建议的最小下一步。
不要全仓库扫描，不要创建文档。
```

### 22.2 执行需求并应用 GEB

```text
请执行这个需求，并遵守 GEB.MD：
- 只在任务半径内补齐缺失地图。
- 不做全仓库 GEB 化。
- 若发现漂移，按 Drift Protocol 报告。
- 只有当前任务需要时才沉积 MODULE/ADR/局部 AGENTS。
```

### 22.3 生成局部地图

```text
请为当前被修改模块生成最小 MODULE.md。
只写有证据支撑的信息。
不要推测全局架构。
不要创建其他文档。
```

### 22.4 处理架构例外

```text
当前需求似乎突破了现有边界。
请不要直接改代码掩盖冲突。
先输出：旧规则、新需求、冲突点、可选方案、是否需要 ADR。
```

---

## 23. Compact Motto / 压缩口号

```text
Keep the map aligned with the terrain,
but let evidence judge both.
```

中文：

```text
让地图跟上地形，但让证据审判二者。
```

工程版：

```text
不全盘迁移。
不无限扩张。
只在需求路径上补齐缺失层。
用证据阻止自我合理化。
用沉积替代膨胀。
```

---

## 24. Compatibility / 与 AGENTS.md 的关系

`GEB.MD` 不会自动生效。

必须在根 `AGENTS.md` 中显式引入，并要求 agent 在任务开始时读取本文件。

推荐写法见项目根 `AGENTS.md` 的集成片段。

当本文件与项目 `AGENTS.md` 冲突时：

```text
- 明确用户要求优先。
- 更局部的 AGENTS.md 优先于根 AGENTS.md。
- 项目特定规则优先于通用 GEB 规则。
- 但任何规则不得削弱安全、隐私、证据、漂移显式化原则。
```

---

## 25. Final Constraint / 最终约束

GEB.MD 的成功标准不是“项目出现很多文档”。

成功标准是：

```text
agent 在每次真实需求中更少迷路，
更少自我合理化，
更少破坏边界，
更敢承认漂移，
并且只把真正沉淀下来的经验写回地图。
```
