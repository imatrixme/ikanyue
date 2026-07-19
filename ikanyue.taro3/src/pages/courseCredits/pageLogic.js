const BATCH_STATUS_LABELS = Object.freeze({
    pending: '待生效',
    unactivated: '待激活',
    active: '可使用',
    depleted: '已用完',
    expired: '已过期',
    cancelled: '已作废',
});

const ACTIVATION_MODE_LABELS = Object.freeze({
    GRANT_TIME: '发放时激活',
    FIRST_RESERVATION: '首次预约后激活',
    FIRST_CHECK_IN: '首次签到后激活',
    FIRST_COMPLETED_SESSION: '首次完课后激活',
    TERM_START: '学期开始时激活',
});

const EVENT_LABELS = Object.freeze({
    GRANT: '课程点到账',
    CONVERT_OUT: '兑换支出',
    CONVERT_IN: '兑换获得',
    FREEZE: '预约冻结',
    ACTIVATE: '批次激活',
    CONSUME: '上课扣除',
    RELEASE: '预约释放',
    EXPIRE: '到期失效',
    EXTEND: '有效期延长',
    REVERSE: '业务冲正',
    ADJUST: '人工调整',
});

const EXPIRY_POLICY_LABELS = Object.freeze({
    INHERIT_SOURCE: '继承来源有效期',
    RESET_ON_CONVERSION: '兑换时重新计算',
    RESET_ON_ACTIVATION: '激活时开始计算',
    MIN_SOURCE_AND_NEW: '取来源与新有效期较早者',
    TARGET_TERM_END: '目标学期结束',
    FIXED_DURATION: '固定有效期',
    TERM_END: '学期结束',
    NO_EXPIRY: '长期有效',
});

const DEBIT_EVENTS = new Set(['CONVERT_OUT', 'CONSUME', 'EXPIRE', 'REVERSE']);

function normalizeSummary(payload = {}) {
    const items = Array.isArray(payload.items) ? payload.items.map(normalizeSummaryItem) : [];
    const universal = items.filter((item) => item.exchangeOnly || item.creditType.kind === 'universal');
    const exact = items.filter((item) => !universal.includes(item));
    return {
        exact,
        items,
        totals: items.reduce((totals, item) => ({
            available: totals.available + item.availableQuantity,
            expiring: totals.expiring + item.expiringQuantity,
            frozen: totals.frozen + item.frozenQuantity,
            unactivated: totals.unactivated + item.unactivatedQuantity,
        }), { available: 0, expiring: 0, frozen: 0, unactivated: 0 }),
        universal,
        warningDays: positiveNumber(payload.warningDays, 30),
    };
}

function normalizeSummaryItem(item = {}) {
    return {
        availableQuantity: quantity(item.availableQuantity),
        creditType: normalizeCreditType(item.creditType),
        exchangeOnly: Boolean(item.exchangeOnly),
        expiringQuantity: quantity(item.expiringQuantity),
        frozenQuantity: quantity(item.frozenQuantity),
        nearestExpiryAt: item.nearestExpiryAt || null,
        unactivatedQuantity: quantity(item.unactivatedQuantity),
    };
}

function normalizeCreditType(value = {}) {
    return {
        code: value.code || '',
        courseSpec: value.courseSpec || null,
        id: value.id || '',
        kind: value.kind || '',
        name: value.name || value.courseSpec?.name || value.code || '课程点',
    };
}

function normalizePage(payload = {}) {
    const items = Array.isArray(payload.items) ? payload.items : [];
    return {
        items,
        page: positiveNumber(payload.page, 1),
        perPage: positiveNumber(payload.perPage, 20),
        totalItems: quantity(payload.totalItems),
        totalPages: quantity(payload.totalPages),
    };
}

function mergePage(current, incoming, key = 'id') {
    const merged = new Map();
    [...(current || []), ...(incoming || [])].forEach((item) => {
        const identity = item?.[key] || item?.sessionStudentId;
        if (identity) merged.set(identity, item);
    });
    return [...merged.values()];
}

function hasNextPage(page = {}) {
    return Number(page.page || 1) < Number(page.totalPages || 0);
}

function formatDate(value) {
    const date = validDate(value);
    if (!date) return '长期有效';
    return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

function formatDateTime(value) {
    const date = validDate(value);
    if (!date) return '时间待定';
    return `${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function expiryState(value, now = Date.now(), warningDays = 30) {
    const date = validDate(value);
    if (!date) return 'none';
    if (date.getTime() <= Number(now)) return 'expired';
    return date.getTime() <= Number(now) + warningDays * 86400000 ? 'warning' : 'valid';
}

function batchStatusLabel(status) {
    return BATCH_STATUS_LABELS[status] || '状态未知';
}

function activationModeLabel(mode) {
    return ACTIVATION_MODE_LABELS[mode] || '按规则激活';
}

function eventLabel(type) {
    return EVENT_LABELS[type] || '课程点变动';
}

function eventSourceText(source) {
    if (!source) return '课程点账户';
    const labels = {
        order: '订单发放',
        conversion_rule: '课程点兑换',
        session: '课次结算',
        session_student: '课次预约',
        credit_batch: '批次调整',
    };
    const label = labels[source.type] || '业务操作';
    const reference = source.operationNo || source.id;
    return reference ? `${label} · ${reference}` : label;
}

function expiryPolicyLabel(policy) {
    return EXPIRY_POLICY_LABELS[policy] || '按当前规则计算';
}

function signedEventQuantity(event = {}) {
    const amount = Math.abs(Number(event.quantityDelta) || 0);
    if (Number(event.quantityDelta) < 0 || DEBIT_EVENTS.has(event.eventType)) return `-${amount}`;
    return amount > 0 ? `+${amount}` : '0';
}

function batchRestrictionText(batch = {}) {
    if (batch.creditType?.kind === 'universal') return '通用课程点仅用于兑换，不能直接抵扣课次';
    if (batch.status === 'unactivated') return activationModeLabel(batch.activationMode);
    if (batch.status === 'expired') return '该批次已失效，不能继续预约';
    if (quantity(batch.frozenQuantity) > 0) return `${quantity(batch.frozenQuantity)} 点已用于未来课次`;
    return '仅适用于对应课程，不与其他课程点混用';
}

function conversionRuleText(rule = {}) {
    const source = normalizeCreditType(rule.sourceCreditType).name;
    const target = normalizeCreditType(rule.targetCreditType).name;
    return `${quantity(rule.sourceQuantity)} ${source} → ${quantity(rule.targetQuantity)} ${target}`;
}

function sourceQuantityForSteps(rule = {}, steps = 1) {
    const normalizedSteps = Math.max(1, Math.floor(Number(steps) || 1));
    const minimum = quantity(rule.minSourceQuantity) || quantity(rule.sourceQuantity) || 1;
    const requested = minimum * normalizedSteps;
    const maximum = quantity(rule.maxSourceQuantity);
    return maximum > 0 ? Math.min(requested, maximum) : requested;
}

function previewFacts(preview = {}) {
    const target = Array.isArray(preview.targets) ? preview.targets[0] || {} : {};
    return [
        { label: '兑换数量', value: `${quantity(preview.sourceQuantity)} → ${quantity(preview.targetQuantity)}` },
        { label: '有效期', value: formatDate(target.effectiveExpiresAt) },
        { label: '激活方式', value: activationModeLabel(target.activationMode || preview.rule?.activationMode) },
        { label: '有效期规则', value: expiryPolicyLabel(target.expiryPolicy || preview.rule?.expiryPolicy) },
        { label: '可否撤回', value: preview.reversible ? '规则允许' : '兑换后不可撤回' },
        { label: '规则版本', value: `V${quantity(preview.rule?.version) || 1}` },
    ];
}

function sessionPresentation(record = {}) {
    const status = record.creditStatus || 'pending';
    const mapping = {
        pending: ['待预约', 'reserve', 'neutral'],
        credit_insufficient: ['课程点不足', 'reserve', 'danger'],
        conversion_required: ['需要先兑换', 'consent', 'warning'],
        reserved: ['已预约课程点', 'none', 'success'],
        consumed: ['已完成扣点', 'none', 'muted'],
        released: ['预约已释放', 'reserve', 'neutral'],
        reversed: ['结算已冲正', 'reserve', 'warning'],
    };
    const [label, action, tone] = mapping[status] || ['状态待确认', 'none', 'muted'];
    return { action, label, tone };
}

function findConversionRule(rules = [], conversion = {}, session = {}) {
    return rules.find((rule) => rule.id === conversion.ruleId)
        || rules.find((rule) => rule.targetCreditType?.id === session.requiredCreditType?.id)
        || null;
}

function buildAuthorizationPayload(preview = {}, session = {}) {
    return {
        previewAt: preview.previewAt,
        previewHash: preview.previewHash,
        ruleId: preview.rule?.id,
        sourceQuantity: preview.sourceQuantity,
        targetTermEnd: null,
        validTo: session.session?.startAt || null,
    };
}

function createIdempotencyKey(scope, now = Date.now, random = Math.random) {
    const timestamp = Number(now()).toString(36);
    const suffix = Math.floor(Number(random()) * 0xFFFFFF).toString(36).padStart(5, '0');
    return `${scope}:${timestamp}:${suffix}`;
}

function courseCreditErrorMessage(error, fallback = '课程点数据暂时无法加载') {
    const messages = {
        CREDIT_INSUFFICIENT: '当前课程点不足，请先兑换或联系老师',
        CONVERSION_PREVIEW_STALE: '兑换条件已变化，请重新预览',
        CONVERSION_RULE_INACTIVE: '该兑换规则已失效',
        SESSION_NOT_RESERVABLE: '当前课次暂不能预约',
        SESSION_ALREADY_SETTLED: '该课次已经结算',
        BATCH_EXPIRED: '相关课程点已经过期',
    };
    return messages[error?.errorCode] || error?.message || fallback;
}

function pageState({ error = '', items = [], loading = false } = {}) {
    if (loading) return 'loading';
    if (error) return 'error';
    return items.length > 0 ? 'ready' : 'empty';
}

function quantity(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
}

function positiveNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
}

function validDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function pad(value) {
    return String(value).padStart(2, '0');
}

export {
    activationModeLabel,
    batchRestrictionText,
    batchStatusLabel,
    buildAuthorizationPayload,
    conversionRuleText,
    courseCreditErrorMessage,
    createIdempotencyKey,
    eventLabel,
    eventSourceText,
    expiryPolicyLabel,
    expiryState,
    findConversionRule,
    formatDate,
    formatDateTime,
    hasNextPage,
    mergePage,
    normalizeCreditType,
    normalizePage,
    normalizeSummary,
    pageState,
    previewFacts,
    quantity,
    sessionPresentation,
    signedEventQuantity,
    sourceQuantityForSteps,
};
