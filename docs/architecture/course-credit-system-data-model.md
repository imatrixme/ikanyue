# 看乐课程点消费系统数据模型

## 1. 范围与约束

本文是 `course-credit-system-technical-design.md` 的数据字典，覆盖课程商品、订单、课程点批次、兑换、班级课堂、教师课堂点、Outbox 与对账。所有数量使用非负整数，所有时间保存为 UTC，业务有效期按 `Asia/Shanghai` 计算。

## 2. 课程与商品

### 2.1 `course_specs`

- `id`, `code`, `name`, `delivery_mode`, `duration_minutes`, `teacher_tier`, `status`
- `default_credit_type_id`, `metadata`, `created`, `updated`

### 2.2 `credit_types`

- `id`, `code`, `name`, `kind(universal|course)`, `course_spec_id`
- `consumable`, `unit_label`, `reference_unit_value`, `status`
- 唯一索引：`code`
- 约束：`kind=universal` 时 `consumable=false`；`kind=course` 时必须关联 `course_spec_id`

### 2.3 `packages`

- `id`, `code`, `name`, `status`, `sale_channel`, `description`
- `activation_mode`, `activation_deadline_days`, `validity_duration_days`, `expiry_policy`

### 2.4 `package_grant_lines`

- `package_id`, `credit_type_id`, `quantity`
- 唯一索引：`package_id + credit_type_id`

### 2.5 `price_versions`

- `id`, `package_id`, `currency`, `list_amount`, `sale_amount`
- `valid_from`, `valid_to`, `status`, `version`
- 发布后不可原地修改，只能创建新版本

## 3. 订单与支付

### 3.1 `orders`

- `id`, `order_no`, `student_id`, `payer_id`, `type`, `channel`, `status`
- `currency`, `list_amount`, `paid_amount`, `price_version_id`
- `product_snapshot`, `grant_snapshot`, `idempotency_key`
- `paid_at`, `cancelled_at`, `created`, `updated`

### 3.2 `payment_events`

- `id`, `order_id`, `provider_event_id`, `type`, `amount`, `payload_hash`, `created`
- 唯一索引：`provider_event_id`

## 4. 课程点操作与批次

### 4.1 `credit_operations`

- `id`, `operation_no`, nullable `student_id`, `type`, `status`
- `idempotency_key`, `source_type`, `source_id`, `rule_version_id`
- nullable `reversal_of_operation_id`
- `request_snapshot`, `result_snapshot`, `actor_id`, `actor_role`, `trace_id`
- required `reason`, `outcome=committed|failed|denied`, `before_summary`, `after_summary`, `created`
- 前后摘要只保存业务状态、数量、版本和对象标识；敏感字段被丢弃，数组只保存元素数量，长文本限制长度。
- 唯一索引：`idempotency_key`
- 学员级命令必须填写 `student_id`；合班课堂发布、改期、结算和冲正等聚合命令允许为空。

### 4.2 `credit_batches`

- `id`, `student_id`, `credit_type_id`, `source_operation_id`
- `original_quantity`, `available_quantity`, `frozen_quantity`
- `consumed_quantity`, `expired_quantity`, `reversed_quantity`
- `status`, `valid_from`, `original_expires_at`, `effective_expires_at`
- `activation_mode`, `activation_deadline`, `activated_at`, `validity_duration_days`
- `list_unit_value`, `paid_unit_cost`, `currency`, `priority`
- `version`, `created`, `updated`
- 索引：`student_id + credit_type_id + status + effective_expires_at`

数量约束：

```text
original = available + frozen + consumed + expired + reversed
所有数量均为非负整数
```

### 4.3 `credit_events`

- `id`, `operation_id`, `batch_id`, `student_id`, `credit_type_id`
- nullable `reversal_of_event_id`
- `event_type`, `quantity_delta`, `bucket_from`, `bucket_to`
- `balance_snapshot`, `business_time`, `actor_id`, `reason`, `metadata`, `created`
- 仅创建，不更新、不删除

### 4.4 `credit_expiry_changes`

- `id`, `batch_id`, `old_expires_at`, `new_expires_at`, `quantity_scope`
- `reason`, `actor_id`, `approved_by`, `created`

## 5. 兑换

### 5.1 `conversion_rules`

- `id`, `source_credit_type_id`, `target_credit_type_id`
- `source_quantity`, `target_quantity`, `min_source_quantity`, `max_source_quantity`
- `expiry_policy`, `activation_mode`, `validity_duration_days`, `activation_deadline_days`
- `reversible`, `reference_value_limit`, `valid_from`, `valid_to`, `version`, `status`
- 发布后不可原地修改

### 5.2 `conversion_authorizations`

- `id`, `student_id`, `rule_id`, `source_credit_type_id`, `target_credit_type_id`
- `terms_fingerprint`, `request_fingerprint`, `status`, `consent_source`
- `idempotency_key`, `valid_from`, `valid_to`, `created`, `updated`
- 授权只允许在学员、规则、来源类型、目标类型、有效期和关键规则条款完全匹配时用于隐式兑换。
- 比例、有效期策略、激活策略或可逆性变化后，旧授权立即失效并要求重新确认。

### 5.3 `conversion_allocations`

- `id`, `operation_id`, `source_batch_id`, `target_batch_id`
- `source_quantity`, `target_quantity`, `expiry_policy_snapshot`, `created`

兑换规则发布器必须构建有向图，检测任何可使参考价值增长的闭环。

## 6. 班级与课堂

### 6.1 `classes`

- `id`, `code`, `name`, `course_spec_id`, `default_credit_type_id`
- `term_start`, `term_end`, `capacity`, `location`, `status`, `metadata`

### 6.2 `class_students`

- `class_id`, `student_id`, `status`, `effective_from`, `effective_to`, `source_order_id`
- 唯一索引：`class_id + student_id + effective_from`

### 6.3 `class_teachers`

- `class_id`, `teacher_id`, `role`, `status`, `effective_from`, `effective_to`

### 6.4 `sessions`

- `id`, `code`, `title`, `status`, `start_at`, `end_at`, `location`
- `required_credit_type_id`, `required_quantity=1`
- `attendance_rule_snapshot`, `settlement_rule_snapshot`, `teacher_rule_snapshot`
- `attendance_rule_snapshot` 固定包含正整数 `version` 以及 `present`、`late`、`leave`、`absent` 的 `consume|release` 动作。
- `settlement_rule_snapshot` 固定包含正整数 `version` 以及学员级 `cancelled` 的 `consume|release` 动作；机构取消由课堂状态强制释放，不接受规则覆盖。
- `teacher_rule_snapshot` 固定包含正整数 `version` 和按 `lead|assistant|observer|evaluator` 分组的 `rules`。每个角色规则保存 `rule_id`、`course_spec_id`、`base_quantity`、`duration_factor`、`participant_factor`，支持一堂课中多个角色使用不同规则。
- 角色规则可选保存 `cancellation_compensation`，其中必须显式给出正数 `quantity` 和 `eligible_actual_statuses`。未配置时机构取消不产生教师收益。
- `roster_version`, `version`, `settlement_operation_id`, nullable `correction_base_status`, `created`, `updated`
- 冲正后 `status=correction_pending`，`correction_base_status` 保存原始 `completed|cancelled` 事实，重结算后清空。

### 6.5 `session_classes`

- `session_id`, `class_id`
- 唯一索引：`session_id + class_id`

### 6.6 `session_students`

- `id`, `session_id`, `student_id`, `source_class_ids`
- `attendance_status`, `credit_status`, `eligibility_reason`
- `checked_in_at`, `settled_at`, `version`, `created`, `updated`
- 唯一索引：`session_id + student_id`

### 6.7 `session_teachers`

- `id`, `session_id`, `teacher_id`, `role`, `assignment_source`
- `actual_status`, `credit_status`, `created`, `updated`
- 唯一索引：`session_id + teacher_id + role`

### 6.8 `session_credit_allocations`

- `id`, `session_student_id`, `batch_id`, `quantity`, `status`
- `reserved_for_start_at`, `operation_id`, `created`, `updated`
- 活跃分配由命令层保证 `session_student_id + batch_id` 唯一

## 7. 教师课堂点

### 7.1 `teacher_credit_rules`

- `id`, `course_spec_id`, `role`, `base_quantity`, `duration_factor`, `participant_factor`
- nullable `cancellation_compensation`
- `valid_from`, `valid_to`, `version`, `status`

### 7.2 `teacher_credit_events`

- `id`, `session_teacher_id`, `teacher_id`, `rule_id`
- `event_type(earn|compensate|confirm|reverse|adjust)`, `quantity_delta`, `status`
- `operation_id`, nullable `confirmation_of_event_id`, nullable `reversal_of_event_id`, `reason`, `created`
- `confirm` 事件保存与原 `earn|compensate` 相同的正数量，并通过 `confirmation_of_event_id` 建立唯一关联；原待确认事件不更新。

教师账户总览由事件投影生成，不复用 `teachers.hours`。

## 8. Outbox 与对账

### 8.1 `outbox_events`

- `id`, `topic`, `aggregate_type`, `aggregate_id`, `payload`
- `status`, `attempts`, `next_attempt_at`, `processing_started_at`, `sent_at`
- `last_error_code`, `last_error_at`, `dead_letter_at`, `created`

### 8.2 `reconciliation_runs`

- `id`, `scope`, `status`, `started_at`, `finished_at`, `difference_count`, `report`

### 8.3 `reconciliation_exceptions`

- `id`, `run_id`, `batch_id`, `code`, `field`
- nullable `expected_value`, nullable `actual_value`, `details`
- `status(open|acknowledged|resolved)`, `detected_at`, `created`
- 对账异常只追加记录，不直接更新批次快照或历史事件。

## 9. 关系与删除策略

- 商品、规则、批次、操作、流水、课堂和结算记录默认不硬删除。
- 学员停用不删除其订单、批次或课堂历史。
- 课程规格停用只阻止新商品和新课堂引用，不影响历史消费。
- 价格与兑换规则发布后通过新版本替代。
- 课堂结算后不直接修改分配和事件，只能冲正并重结算。
- 关系字段删除采用 restrict 或软删除，避免产生孤立账本记录。

## 10. 必要唯一约束

- `orders.order_no`
- `payment_events.provider_event_id`
- `credit_operations.idempotency_key`
- `course_specs.code`
- `credit_types.code`
- `classes.code`
- `sessions.code`
- `session_students(session_id, student_id)`
- `session_classes(session_id, class_id)`
- `session_teachers(session_id, teacher_id, role)`

唯一约束必须由数据库或事务命令的等价原子检查保证，不能只依赖前端校验。
