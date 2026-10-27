const SETTLEMENT_OPERATION_TYPES = [
    'reserve', 'consume', 'release', 'expire', 'settle_session', 'reverse_session_settlement',
];

function buildSettlementExceptions(sources = {}) {
    const items = [
        ...(sources.roster || []).map(rosterException),
        ...(sources.allocations || []).map(allocationException),
        ...(sources.operations || []).map(operationException),
        ...(sources.sessions || []).map(correctionException),
        ...(sources.reconciliation || []).filter(isDuplicate).map(duplicateException),
    ];
    return items.sort((left, right) => String(right.detectedAt || '').localeCompare(String(left.detectedAt || '')));
}

function filterSettlementExceptions(items, query = {}) {
    return items.filter((item) => (
        (!query.kind || item.kind === query.kind)
        && (!query.status || item.status === query.status)
        && (!query.sessionId || item.sessionId === query.sessionId)
        && (!query.studentId || item.studentId === query.studentId)
    ));
}

function rosterException(record) {
    return base(record, {
        kind: record.creditStatus,
        resourceType: 'session_student',
        sessionId: relationId(record.sessionId),
        studentId: relationId(record.studentId),
        status: 'open',
        reason: record.eligibilityReason || record.creditStatus,
    });
}

function allocationException(record) {
    const roster = record.expand?.sessionStudentId || {};
    return base(record, {
        kind: 'expired_release',
        resourceType: 'session_credit_allocation',
        sessionId: relationId(roster.sessionId),
        studentId: relationId(roster.studentId),
        status: 'open',
        reason: '预留课时在释放时已过期',
        quantity: Number(record.quantity) || 0,
        batchId: relationId(record.batchId),
    });
}

function operationException(record) {
    const failure = failureDetails(record);
    return base(record, {
        kind: failure.code.includes('DUPLICATE') ? 'duplicate' : 'failed_operation',
        resourceType: 'credit_operation',
        sessionId: snapshotValue(record, 'sessionId') || sourceSessionId(record),
        studentId: relationId(record.studentId),
        status: 'failed',
        reason: failure.message || failure.code || record.reason || '课时操作失败',
        operationType: record.type || '',
    });
}

function correctionException(record) {
    return base(record, {
        kind: 'correction_pending',
        resourceType: 'session',
        sessionId: record.id,
        studentId: null,
        status: 'correction_pending',
        reason: record.correctionReason || '课堂结算已撤回，等待教务更正',
    });
}

function duplicateException(record) {
    return base(record, {
        kind: 'duplicate',
        resourceType: 'reconciliation_exception',
        sessionId: snapshotValue(record, 'sessionId'),
        studentId: snapshotValue(record, 'studentId'),
        status: record.status || 'open',
        reason: record.code || 'DUPLICATE_EVENT',
        batchId: relationId(record.batchId),
    }, record.detectedAt);
}

function base(record, fields, detectedAt = '') {
    return {
        id: record.id,
        resourceId: record.id,
        detectedAt: detectedAt || record.updated || record.created || null,
        ...fields,
    };
}

function failureDetails(record) {
    const result = object(record.resultSnapshot);
    const nested = object(result.error);
    return {
        code: String(result.errorCode || nested.code || result.code || '').toUpperCase(),
        message: String(result.message || nested.message || ''),
    };
}

function snapshotValue(record, field) {
    const result = object(record.resultSnapshot);
    const request = object(record.requestSnapshot);
    return relationId(result[field]) || relationId(request[field]) || null;
}

function sourceSessionId(record) {
    return record.sourceType === 'session' ? String(record.sourceId || '') || null : null;
}

function isDuplicate(record) {
    return String(record.code || '').toUpperCase().includes('DUPLICATE');
}

function object(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function relationId(value) {
    return value && typeof value === 'object' ? value.id || null : value || null;
}

module.exports = {
    SETTLEMENT_OPERATION_TYPES,
    buildSettlementExceptions,
    filterSettlementExceptions,
};
