## Context

- 一期模型：
  - `sites`（hosts）→ `routes`（一个服务 + 勾选的 operations）；
  - `plugin_bindings` 的作用范围是 `global / site / route / consumer`；
  - `config_versions` 保存全量快照，发布对所有环境生效；
  - 环境（`X-Ca-Stage`）只用来挑实例池；
  - 审计只在后台请求钩子里记改后的值。
- 已确认的决定（2026-10-28）：
  - 按 API × 环境上线；
  - 环境由请求头选择，域名也可以固定某个环境；
  - RELEASE 与 PRE 不一致时只提示差异；
  - 对外路径与后端路径一致。

## Goals / Non-Goals

- Goals：
  - 接口归集到组，组上绑定域名；
  - 组级与 API 级都能配置策略，并可锁定；
  - 三个环境独立上线，未上线时维持旧配置；
  - 所有变更可审计、可回滚；
  - 迁移过程中线上转发不变。
- Non-Goals：变更集、审批流、权限分级、参数映射、多节点下发（仍按一期的集群前瞻设计）。

## Decisions

### D1. 对象模型

| 对象 | 关键字段 | 说明 |
|---|---|---|
| API 分组 `api_groups` | name、defaultPolicySet、note | 组设置（域名 + 默认策略组）按环境上线 |
| 域名 `group_domains` | group、host（唯一）、defaultStage、fixedStage | 一个域名只属于一个组；设置了 `fixedStage` 时忽略 `X-Ca-Stage` |
| API `apis` | group、operation、visibility、auth、policySet、overrides、priority、timeouts | `operation` 只能从已发现的接口里选；(组, 方法, 路径) 唯一 |
| 策略组 `policy_sets` | name、items[] | 每项：plugin、config、stages、locked、priority |
| 平台基线 | 内置的策略组 `baseline` | 不能删除，可以编辑、可以锁定 |
| 授权 `grants` | consumer、group 或 api、stages | 私有 API 只放行被授权的应用 |
| 上线记录 `releases` | stage、kind（api / group）、target、version、definition、previous、actor、reason、forced | `definition` 保存解析后的完整定义 |
| 审计 `audit_logs` | 增加 before、after、diff | 只能追加 |

- 同一个接口可以被多个组引用，例如小程序组和合作方组。
- `visibility=private` 要求鉴权方式为应用签名，并且应用有授权；`auth` 字段会自动带出对应的插件，不需要再单独绑定。

### D2. 上线模型（按 API × 环境）

- 草稿就是集合里的当前值；修改不会影响任何环境。
- 上线 `release(stage, targets[])`，`targets` 可以是若干个 API 或组设置：
  1. 为每个目标解析出有效定义（API 定义 + 有效策略，见 D3），和该环境当前的已上线定义比较，生成差异；
  2. 执行上线前检查：
     - 目标环境要有健康实例；
     - 同一域名下的路径不能冲突（同优先级的重叠视为冲突）；
     - 插件配置要能通过 Schema 校验；
     - 来源接口不能已被服务移除；
     - 私有 API 必须使用应用签名；
  3. 在一个事务里写入 `releases`，用该环境所有已上线定义重新编译快照，写入该环境的最后可用文件，再原子替换该环境的快照。
- 下线是一种上线：该 API 在这个环境的定义置空。
- 回滚：选一条历史上线记录，用它的 `definition` 作为新的一次上线。回滚本身也有记录，不会改写历史。
- 推进提示：上线 RELEASE 时，如果定义和 PRE 当前定义不同，返回差异并要求 `reason`；`force` 可以跳过健康实例检查，同样必须填原因。
- 理由：上线记录保存解析后的定义，回滚就能精确复原，数据面也不需要在运行时合并多处配置。

### D3. 策略组与有效策略

各层按以下顺序叠加，**每层最多一个来源**：

```
1 平台基线（baseline）
2 分组默认策略组（api_groups.defaultPolicySet）
3 API 策略组（apis.policySet，可选）
4 API 覆盖项（apis.overrides：修改未锁定项的配置，或停用未锁定项）
5 应用级（消费者的特殊配置，只对该应用的请求生效）
```

- **合并规则**：

  | 类别 | 插件 | 下层再出现同名策略时 |
  |---|---|---|
  | 覆盖型 | 鉴权、`cors`、`ip-restriction`、`circuit-breaker`、`fallback`、`request-rewrite`、`body-limit`、`maintenance`、`mock`、`traffic-split`、`mirror` | 替换上层的配置 |
  | 叠加型 | `rate-limit` | 每层各自计数，全部满足才放行 |

- **锁定**：某一层的锁定项，它下面的层都不能修改或停用。
  - 覆盖型：下层出现同名策略即报错。
  - 叠加型：下层只能新增，不能停用。
  - 保存时就校验，不等到上线。
- **执行顺序**：同一阶段内按 `priority` 排序；未设置时用插件的默认优先级。
- **环境**：每个策略项都带 `stages`，解析时只取目标环境的策略。
- **不支持组合**：
  - 策略组不能引用其他策略组；
  - 一个组或一个 API 不能同时挂多个策略组。
  - 理由：允许组合后，有效策略就取决于组合顺序和多来源之间的冲突，“谁覆盖谁”无法从界面上一眼看出，锁定规则也会失去确定性。固定的四层模型足以覆盖“组的默认规则 + 一类 API 的共同例外 + 单个 API 的特例”。
- **防止失控的约束**：
  - 修改策略组或锁定状态前，列出受影响的组和 API，以及它们在各环境的有效策略差异；
  - 策略组的改动同样只是草稿：受影响的 API 显示“有未上线变更”，需要按环境上线（可按策略组批量上线），所以策略组的改动不会绕过上线流程；
  - 控制台提示两种情况：没有被引用的策略组；只被一个 API 引用的策略组（建议改为覆盖项）；
  - API 详情页展示每个环境的有效策略，标明每一项来自哪一层、是否锁定。

### D4. 数据面

- 每个环境一份快照：`stage → host → 编译好的 ServeMux（API 与插件链）`，由 `atomic.Pointer` 保存。
  - 请求处理：确定环境（固定环境 > `X-Ca-Stage` > 域名默认环境）→ 匹配 API → 执行插件链 → 从该环境的实例池挑选后端。
  - 实例池、健康检查、重试、超时沿用一期。
- 最后可用文件按环境分别保存，启动时逐个环境加载。
- 请求日志和指标增加组、API、环境维度；告警规则可以按组或 API 设置。

### D5. 审计

- 后台写操作的钩子在保存前读取原记录，写入 before、after 与字段级 diff。密钥类字段只记指纹。
- 以下操作单独记录，并写明目标和版本：上线、下线、回滚、`exposure apply`、迁移。
- `audit_logs` 的 API 规则只允许读；控制面只追加，不提供修改和删除接口。

### D6. 迁移

迁移在一个事务里完成，执行前先做一次 PocketBase 备份：

| 原对象 | 迁移为 |
|---|---|
| `sites` | `api_groups` + `group_domains`（`defaultStage=RELEASE`） |
| `routes` 勾选的每个接口 | 该组下的一个 API；`auth=透传`，`visibility=公开`；路由上的超时迁到 API |
| `plugin_bindings` 全局级 | 平台基线的策略项 |
| `plugin_bindings` 站点级 | 新建策略组 `<site>-default`，挂为该组的默认策略组 |
| `plugin_bindings` 路由级 | 该路由下各 API 的覆盖项 |
| `plugin_bindings` 消费者级 | 应用级 |
| 当前发布的快照 | 为每个 API 和组设置在 TEST、PRE、RELEASE 各写一条上线记录（v1），使三环境与迁移前完全一致 |

- `sites`、`routes`、`plugin_bindings`、`config_versions` 保留为只读，用于查看历史。
- 验收：迁移前后，同一组请求在每个环境的转发结果一致（对照测试 + kanyue.server 契约测试经网关）。

### D7. 暴露清单

- `internal/exposure/*.json` 升级为分组定义：分组、域名，以及 API 列表（接口模式 + 可选的可见性、鉴权、策略组名）。
- `exposure apply` 写入分组和 API 草稿并记审计，不上线。
- 现有的两份守卫（与小程序调用一致；接口都由 server 提供，且不是 ops 或内部接口）改为读取新格式。

### D8. 控制台

- 页面：
  - API 分组列表；
  - 分组详情：域名、默认策略组、API 表格，每行显示 TEST / PRE / RELEASE 状态，可批量上线；
  - API 详情：定义、每个环境的有效策略与来源、版本、差异、历史、回滚；
  - 策略组：策略项、锁定、引用方、影响预览；
  - 应用与授权；
  - 上线记录；
  - 审计（带差异）。
- 从接口候选创建 API 沿用现有的勾选器，仍然没有“全选所有接口”，也不会自动挂载。

## Risks / Trade-offs

- 每个 API 在每个环境都有一份版本，概念比全量发布多。缓解：表格里的环境状态标签和批量上线；默认流程是“组内勾选 → 上线 TEST → PRE → RELEASE”。
- 平台基线或常用策略组一改，会让大量 API 进入“有未上线变更”。这是有意为之：生产配置不会在没人点击上线的情况下改变。批量上线提供按策略组筛选。
- 上线记录保存解析后的定义，会有冗余存储。按现在的规模（几百个 API × 3 个环境）可以忽略，换来的是精确回滚。

## Migration Plan

1. 先归档 `add-kanyue-gateway`。
2. 实现 P1：模型、上线、迁移、审计；本地用 native-stack 做迁移前后的对照测试。
3. 在 `mapi.ikanyue.com` 切流之前完成迁移；回退时恢复迁移前的备份并使用旧二进制。

## Open Questions

- D3 的“不支持组合、固定分层”已由用户确认（2026-10-28）。如果以后确实需要多个策略组组合，可以作为第五层“附加策略组（只能叠加，不能覆盖）”另行提案，不影响本模型。
