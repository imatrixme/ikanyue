const { invariant } = require('./errors');

const SETTLEMENT_ACTIONS = ['consume', 'release'];
const RULED_ATTENDANCE_STATUSES = ['present', 'late', 'leave', 'absent'];
const FINAL_ATTENDANCE_STATUSES = [...RULED_ATTENDANCE_STATUSES, 'cancelled'];

function validateSettlementRuleSnapshots(attendanceRuleSnapshot, settlementRuleSnapshot) {
    validateSnapshot(attendanceRuleSnapshot, 'ATTENDANCE_RULE_SNAPSHOT_REQUIRED');
    validateSnapshot(settlementRuleSnapshot, 'SETTLEMENT_RULE_SNAPSHOT_REQUIRED');
    for (const status of RULED_ATTENDANCE_STATUSES) {
        validateAction(attendanceRuleSnapshot[status], status, 'attendance');
    }
    validateAction(settlementRuleSnapshot.cancelled, 'cancelled', 'settlement');
    return { attendanceRuleSnapshot, settlementRuleSnapshot };
}

function settlementDecision(session, sessionStudent) {
    invariant(session && ['completed', 'cancelled'].includes(session.status),
        'SESSION_NOT_SETTLEABLE', 'Only completed or cancelled sessions can settle student credits');
    invariant(sessionStudent && typeof sessionStudent.attendanceStatus === 'string',
        'ATTENDANCE_STATUS_REQUIRED', 'Session student attendance status is required');

    const snapshots = validateSettlementRuleSnapshots(
        session.attendanceRuleSnapshot,
        session.settlementRuleSnapshot
    );
    if (session.status === 'cancelled') {
        return decision('release', 'institution_cancelled', snapshots.settlementRuleSnapshot.version);
    }

    const status = sessionStudent.attendanceStatus;
    invariant(FINAL_ATTENDANCE_STATUSES.includes(status),
        ['scheduled', 'checked_in'].includes(status) ? 'ATTENDANCE_NOT_FINAL' : 'INVALID_ATTENDANCE_STATUS',
        'A final attendance status is required before credit settlement', { attendanceStatus: status });

    const snapshot = status === 'cancelled'
        ? snapshots.settlementRuleSnapshot
        : snapshots.attendanceRuleSnapshot;
    return decision(snapshot[status], status, snapshot.version);
}

function validateSnapshot(snapshot, code) {
    invariant(
        snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
            && Object.keys(snapshot).length > 0,
        code,
        'Session requires an immutable rule snapshot'
    );
    invariant(Number.isInteger(snapshot.version) && snapshot.version > 0,
        'RULE_SNAPSHOT_VERSION_INVALID', 'Rule snapshot version must be a positive integer');
}

function validateAction(action, status, source) {
    invariant(SETTLEMENT_ACTIONS.includes(action),
        'SETTLEMENT_ACTION_INVALID', `Settlement action for ${status} must be consume or release`, {
            action,
            source,
            status,
        });
}

function decision(action, ruleSource, ruleVersion) {
    return {
        action,
        creditStatus: action === 'consume' ? 'consumed' : 'released',
        eventType: action === 'consume' ? 'CONSUME' : 'RELEASE',
        ruleSource,
        ruleVersion,
        targetBucket: action === 'consume' ? 'consumedQuantity' : 'availableQuantity',
    };
}

module.exports = {
    FINAL_ATTENDANCE_STATUSES,
    RULED_ATTENDANCE_STATUSES,
    SETTLEMENT_ACTIONS,
    settlementDecision,
    validateSettlementRuleSnapshots,
};
