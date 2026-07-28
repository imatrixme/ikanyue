const { invariant } = require('./domain');

const RESOURCE_SCHEMAS = Object.freeze({
    courseSpecs: schema('course_specs', [
        'code', 'name', 'deliveryMode', 'durationMinutes', 'teacherTier', 'status', 'defaultCreditTypeId', 'metadata',
    ], ['draft', 'active', 'inactive'], validateCourseSpec),
    packages: schema('packages', [
        'code', 'name', 'description', 'saleChannel', 'activationMode', 'activationDeadlineDays',
        'validityDurationDays', 'expiryPolicy', 'status',
    ], ['draft', 'active', 'inactive'], validatePackage),
    grantLines: schema('package_grant_lines', ['packageId', 'creditTypeId', 'quantity'], [], validateGrantLine),
    priceVersions: schema('price_versions', [
        'packageId', 'currency', 'listAmount', 'saleAmount', 'validFrom', 'validTo', 'version', 'status', 'grantSnapshot',
    ], ['draft', 'active', 'inactive'], validatePriceVersion, true),
    classes: schema('classes', [
        'code', 'name', 'courseSpecId', 'defaultCreditTypeId', 'termStart', 'termEnd',
        'capacity', 'location', 'status', 'metadata',
    ], ['draft', 'active', 'completed', 'cancelled'], validateClass),
    lessons: schema('sessions', [
        'code', 'title', 'status', 'startAt', 'endAt', 'location', 'requiredCreditTypeId',
        'requiredQuantity', 'attendanceRuleSnapshot', 'settlementRuleSnapshot', 'teacherRuleSnapshot',
        'rosterVersion', 'version', 'originType',
    ], ['draft', 'scheduled', 'enrollment_closed', 'in_progress', 'completed', 'cancelled'], validateLesson),
});

function schema(collection, fields, statuses, validate, revisioned = false) {
    return { collection, fields: new Set(fields), statuses: new Set(statuses), validate, revisioned };
}

function resourceSchema(name) {
    const config = RESOURCE_SCHEMAS[name];
    invariant(config, 'ADMIN_RESOURCE_UNSUPPORTED', '不支持的课程管理资源', { resource: name });
    return config;
}

function normalizeResourceInput(name, input, current = null) {
    const config = resourceSchema(name);
    invariant(input && typeof input === 'object' && !Array.isArray(input),
        'ADMIN_RESOURCE_BODY_REQUIRED', '请求内容必须是对象');
    const normalizedInput = name === 'lessons' && input.originType === undefined
        && (!current || current.originType === undefined)
        ? { ...input, originType: 'admin' }
        : input;
    const unknown = Object.keys(normalizedInput).filter((key) => !config.fields.has(key));
    invariant(unknown.length === 0, 'ADMIN_RESOURCE_FIELD_INVALID', '请求包含不支持的字段', { fields: unknown });
    const data = { ...(current ? pick(current, config.fields) : {}), ...normalizedInput };
    config.validate(data);
    return pick(data, config.fields);
}

function validateStatus(name, status) {
    const config = resourceSchema(name);
    invariant(config.statuses.has(status), 'ADMIN_RESOURCE_STATUS_INVALID', '资源状态无效', { status });
    return status;
}

function validateCourseSpec(data) {
    requiredText(data.code, 'COURSE_CODE_REQUIRED');
    requiredText(data.name, 'COURSE_NAME_REQUIRED');
    oneOf(data.deliveryMode, ['one_to_one', 'group', 'workshop', 'online', 'hybrid'], 'COURSE_DELIVERY_MODE_INVALID');
    positiveInteger(data.durationMinutes, 'COURSE_DURATION_INVALID');
    oneOf(data.status, ['draft', 'active', 'inactive'], 'COURSE_STATUS_INVALID');
}

function validatePackage(data) {
    requiredText(data.code, 'PACKAGE_CODE_REQUIRED');
    requiredText(data.name, 'PACKAGE_NAME_REQUIRED');
    oneOf(data.saleChannel, ['admin', 'wechat', 'website', 'offline', 'all'], 'PACKAGE_CHANNEL_INVALID');
    oneOf(data.activationMode, activationModes(), 'PACKAGE_ACTIVATION_MODE_INVALID');
    oneOf(data.expiryPolicy, ['FIXED_DURATION', 'TERM_END', 'NO_EXPIRY'], 'PACKAGE_EXPIRY_POLICY_INVALID');
    oneOf(data.status, ['draft', 'active', 'inactive'], 'PACKAGE_STATUS_INVALID');
    optionalNonNegativeInteger(data.activationDeadlineDays, 'PACKAGE_ACTIVATION_DEADLINE_INVALID');
    optionalNonNegativeInteger(data.validityDurationDays, 'PACKAGE_VALIDITY_INVALID');
    if (data.activationMode !== 'GRANT_TIME') {
        invariant(data.activationDeadlineDays !== '' && data.activationDeadlineDays !== null
            && data.activationDeadlineDays !== undefined,
        'PACKAGE_ACTIVATION_DEADLINE_REQUIRED', '延迟生效课包必须设置激活期限');
        nonNegativeInteger(data.activationDeadlineDays, 'PACKAGE_ACTIVATION_DEADLINE_REQUIRED');
    }
    if (data.expiryPolicy === 'FIXED_DURATION') {
        invariant(data.validityDurationDays !== '' && data.validityDurationDays !== null
            && data.validityDurationDays !== undefined,
        'PACKAGE_VALIDITY_REQUIRED', '固定期限课包必须设置有效天数');
        nonNegativeInteger(data.validityDurationDays, 'PACKAGE_VALIDITY_REQUIRED');
    }
}

function validateGrantLine(data) {
    requiredText(data.packageId, 'PACKAGE_ID_REQUIRED');
    requiredText(data.creditTypeId, 'CREDIT_TYPE_ID_REQUIRED');
    positiveInteger(data.quantity, 'GRANT_QUANTITY_INVALID');
}

function validatePriceVersion(data) {
    requiredText(data.packageId, 'PACKAGE_ID_REQUIRED');
    invariant(/^[A-Z]{3}$/.test(data.currency || ''), 'PRICE_CURRENCY_INVALID', '币种必须是三位大写代码');
    nonNegativeNumber(data.listAmount, 'PRICE_LIST_AMOUNT_INVALID');
    nonNegativeNumber(data.saleAmount, 'PRICE_SALE_AMOUNT_INVALID');
    invariant(Number(data.saleAmount) <= Number(data.listAmount), 'PRICE_SALE_AMOUNT_INVALID', '销售价不能高于标价');
    validDate(data.validFrom, 'PRICE_VALID_FROM_INVALID');
    optionalLaterDate(data.validTo, data.validFrom, 'PRICE_VALID_TO_INVALID');
    positiveInteger(data.version, 'PRICE_VERSION_INVALID');
    oneOf(data.status, ['draft', 'active', 'inactive'], 'PRICE_STATUS_INVALID');
}

function validateClass(data) {
    requiredText(data.code, 'CLASS_CODE_REQUIRED');
    requiredText(data.name, 'CLASS_NAME_REQUIRED');
    requiredText(data.courseSpecId, 'COURSE_ID_REQUIRED');
    requiredText(data.defaultCreditTypeId, 'CREDIT_TYPE_ID_REQUIRED');
    optionalPositiveInteger(data.capacity, 'CLASS_CAPACITY_INVALID');
    optionalLaterDate(data.termEnd, data.termStart, 'CLASS_TERM_INVALID');
    oneOf(data.status, ['draft', 'active', 'completed', 'cancelled'], 'CLASS_STATUS_INVALID');
}

function validateLesson(data) {
    requiredText(data.code, 'LESSON_CODE_REQUIRED');
    requiredText(data.title, 'LESSON_TITLE_REQUIRED');
    oneOf(data.status, ['draft', 'scheduled', 'enrollment_closed', 'in_progress', 'completed', 'cancelled'],
        'LESSON_STATUS_INVALID');
    validDate(data.startAt, 'LESSON_START_INVALID');
    laterDate(data.endAt, data.startAt, 'LESSON_END_INVALID');
    requiredText(data.requiredCreditTypeId, 'CREDIT_TYPE_ID_REQUIRED');
    positiveInteger(data.requiredQuantity, 'LESSON_QUANTITY_INVALID');
    requiredObject(data.attendanceRuleSnapshot, 'ATTENDANCE_RULE_SNAPSHOT_REQUIRED');
    requiredObject(data.settlementRuleSnapshot, 'SETTLEMENT_RULE_SNAPSHOT_REQUIRED');
    requiredObject(data.teacherRuleSnapshot, 'TEACHER_RULE_SNAPSHOT_REQUIRED');
    positiveInteger(data.rosterVersion, 'LESSON_ROSTER_VERSION_INVALID');
    positiveInteger(data.version, 'LESSON_VERSION_INVALID');
    oneOf(data.originType, ['class', 'admin'], 'LESSON_ORIGIN_TYPE_INVALID');
}

function activationModes() {
    return ['GRANT_TIME', 'FIRST_RESERVATION', 'FIRST_CHECK_IN', 'FIRST_COMPLETED_SESSION', 'TERM_START'];
}

function pick(value, fields) {
    return Object.fromEntries([...fields].filter((key) => value[key] !== undefined).map((key) => [key, value[key]]));
}

function requiredText(value, code) {
    invariant(typeof value === 'string' && value.trim(), code, '必填文本不能为空');
}

function oneOf(value, values, code) {
    invariant(values.includes(value), code, '选项值无效');
}

function positiveInteger(value, code) {
    invariant(Number.isInteger(Number(value)) && Number(value) > 0, code, '必须是正整数');
}

function optionalPositiveInteger(value, code) {
    if (value !== undefined && value !== null && value !== '') positiveInteger(value, code);
}

function nonNegativeInteger(value, code) {
    invariant(Number.isInteger(Number(value)) && Number(value) >= 0, code, '必须是非负整数');
}

function optionalNonNegativeInteger(value, code) {
    if (value !== undefined && value !== null && value !== '') nonNegativeInteger(value, code);
}

function nonNegativeNumber(value, code) {
    invariant(Number.isFinite(Number(value)) && Number(value) >= 0, code, '必须是非负数');
}

function validDate(value, code) {
    invariant(Number.isFinite(Date.parse(value)), code, '日期无效');
}

function laterDate(value, start, code) {
    validDate(value, code);
    invariant(Date.parse(value) > Date.parse(start), code, '结束时间必须晚于开始时间');
}

function optionalLaterDate(value, start, code) {
    if (!value) return;
    validDate(start, code);
    laterDate(value, start, code);
}

function requiredObject(value, code) {
    invariant(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0,
        code, '规则快照不能为空');
}

module.exports = {
    RESOURCE_SCHEMAS,
    normalizeResourceInput,
    resourceSchema,
    validateStatus,
};
