const { createRecordId, invariant } = require('./domain');
const { create } = require('./reservationRequests');
const { FOLLOW_UP_ACTION } = require('./opsQueryService');

const FOLLOW_UP_STATUSES = new Set(['contacted', 'declined']);
const MAX_NOTE_LENGTH = 300;

class StudentFollowUpService {
    constructor(repository, options = {}) {
        this.repository = repository;
        this.clock = options.clock || Date.now;
        this.idFactory = options.idFactory || createRecordId;
    }

    async record(input = {}) {
        invariant(typeof input.studentId === 'string' && input.studentId, 'STUDENT_ID_REQUIRED', '请选择学员');
        invariant(FOLLOW_UP_STATUSES.has(input.status), 'FOLLOW_UP_STATUS_INVALID', '跟进结果无效');
        const now = this.clock();
        const snoozeUntil = input.snoozeUntil ? Date.parse(input.snoozeUntil) : NaN;
        invariant(Number.isFinite(snoozeUntil) && snoozeUntil > now, 'FOLLOW_UP_SNOOZE_INVALID', '下次提醒日期必须晚于现在');
        await this.repository.get('students', input.studentId);
        const record = {
            id: this.idFactory(),
            actorId: input.actorId || '',
            actorRole: input.actorRole === 'admin' ? 'admin' : 'teacher',
            action: FOLLOW_UP_ACTION,
            resourceType: 'students',
            resourceId: input.studentId,
            outcome: 'success',
            metadata: {
                status: input.status,
                note: typeof input.note === 'string' ? input.note.trim().slice(0, MAX_NOTE_LENGTH) : '',
                snoozeUntil: new Date(snoozeUntil).toISOString(),
            },
        };
        await this.repository.send([create('ops_audit_logs', record)]);
        return {
            id: record.id,
            studentId: record.resourceId,
            ...record.metadata,
            actorId: record.actorId,
            created: new Date(now).toISOString(),
        };
    }
}

module.exports = { FOLLOW_UP_STATUSES, StudentFollowUpService };
