const { invariant } = require('./domain');

class CourseCreditShadowService {
    constructor(settlementPreviewService, options = {}) {
        this.settlementPreviewService = settlementPreviewService;
        this.clock = options.clock || Date.now;
    }

    async run(input = {}) {
        const sessionIds = validateSessionIds(input.sessionIds);
        const expectations = expectationMap(input.expectations);
        const reports = [];
        for (const sessionId of sessionIds) {
            const expectation = expectations.get(sessionId);
            try {
                const actual = await this.settlementPreviewService.previewSettlement(sessionId);
                reports.push(compareSession(sessionId, actual, expectation));
            } catch (error) {
                reports.push(failedSession(sessionId, error, expectation));
            }
        }
        const differenceCount = reports.reduce((total, report) => total + report.differences.length, 0);
        return {
            differenceCount,
            generatedAt: new Date(this.clock()).toISOString(),
            reports,
            sessionCount: reports.length,
            status: differenceCount === 0 ? 'passed' : 'failed',
            writeCount: 0,
        };
    }
}

function validateSessionIds(value) {
    invariant(Array.isArray(value) && value.length > 0,
        'SHADOW_SESSION_IDS_REQUIRED', '影子运行必须选择至少一节真实课堂');
    invariant(value.length <= 100, 'SHADOW_SESSION_LIMIT_EXCEEDED', '单次影子运行最多处理 100 节课堂');
    const ids = value.map((item) => String(item || '').trim());
    invariant(ids.every(Boolean), 'SHADOW_SESSION_ID_INVALID', '影子课堂编号不能为空');
    invariant(new Set(ids).size === ids.length, 'SHADOW_SESSION_DUPLICATE', '影子课堂编号不能重复');
    return ids;
}

function expectationMap(value) {
    const entries = Array.isArray(value) ? value.map(normalizeExpectation) : [];
    invariant(new Set(entries.map((item) => item.sessionId)).size === entries.length,
        'SHADOW_EXPECTATION_DUPLICATE', '同一课堂不能重复填写教务预期');
    return new Map(entries.map((item) => [item.sessionId, item]));
}

function normalizeExpectation(value = {}) {
    const sessionId = String(value.sessionId || '').trim();
    invariant(sessionId, 'SHADOW_EXPECTATION_SESSION_REQUIRED', '教务预期必须关联课堂');
    invariant(typeof value.canSettle === 'boolean',
        'SHADOW_EXPECTATION_SETTLE_REQUIRED', '教务预期必须明确课堂能否核销');
    return {
        canSettle: value.canSettle,
        sessionId,
        students: normalizeRows(value.students, 'sessionStudentId', ['action']),
        teachers: normalizeRows(value.teachers, 'sessionTeacherId', ['action', 'quantity']),
    };
}

function normalizeRows(value, idKey, fields) {
    const rows = Array.isArray(value) ? value.map((item) => ({
        [idKey]: String(item?.[idKey] || '').trim(),
        ...Object.fromEntries(fields.map((field) => [field, item?.[field]])),
    })) : [];
    invariant(rows.every((item) => item[idKey]),
        'SHADOW_EXPECTATION_ROW_INVALID', '教务预期明细必须包含关系编号');
    invariant(new Set(rows.map((item) => item[idKey])).size === rows.length,
        'SHADOW_EXPECTATION_ROW_DUPLICATE', '教务预期明细不能重复');
    return rows;
}

function compareSession(sessionId, actual, expected) {
    const differences = [];
    if (!expected) differences.push(difference('EXPECTATION_MISSING', 'session', true, false));
    else {
        if (actual.canSettle !== expected.canSettle) differences.push(
            difference('CAN_SETTLE_MISMATCH', 'canSettle', expected.canSettle, actual.canSettle)
        );
        differences.push(...compareRows(expected.students, actual.students, 'sessionStudentId', ['action']));
        differences.push(...compareRows(expected.teachers, actual.teachers, 'sessionTeacherId', ['action', 'quantity']));
    }
    return { actual, differences, expectationProvided: Boolean(expected), expected: expected || null, sessionId };
}

function compareRows(expected, actual, idKey, fields) {
    const differences = [];
    const expectedById = new Map(expected.map((item) => [item[idKey], item]));
    const actualById = new Map((actual || []).map((item) => [item[idKey], item]));
    for (const [id, row] of expectedById) {
        const observed = actualById.get(id);
        if (!observed) {
            differences.push(difference('EXPECTED_ROW_MISSING', `${idKey}:${id}`, row, null));
            continue;
        }
        for (const field of fields) {
            if (!same(row[field], observed[field])) differences.push(
                difference('EXPECTED_VALUE_MISMATCH', `${idKey}:${id}.${field}`, row[field], observed[field])
            );
        }
    }
    for (const [id, row] of actualById) if (!expectedById.has(id)) differences.push(
        difference('UNEXPECTED_ROW', `${idKey}:${id}`, null, row)
    );
    return differences;
}

function failedSession(sessionId, error, expected) {
    return {
        actual: null,
        differences: [difference(
            'SHADOW_PREVIEW_FAILED', 'session', expected || null,
            { errorCode: error?.code || 'COURSE_CREDIT_INTERNAL_ERROR', message: error?.message || '影子计算失败' }
        )],
        expectationProvided: Boolean(expected),
        expected: expected || null,
        sessionId,
    };
}

function difference(code, field, expected, actual) { return { actual, code, expected, field }; }
function same(left, right) { return typeof left === 'number' || typeof right === 'number' ? Number(left) === Number(right) : left === right; }

module.exports = {
    CourseCreditShadowService,
    compareRows,
    compareSession,
    expectationMap,
    failedSession,
    normalizeExpectation,
    validateSessionIds,
};
