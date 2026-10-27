const {
    collection,
    dateField,
    jsonField,
    numberField,
    relationField,
    selectField,
    textField,
} = require('./fields');

const BASE_TEACHING_SCHEMAS = [
    collection('classes', [
        textField('code', { required: true }),
        textField('name', { required: true }),
        relationField('courseSpecId', 'course_specs', { required: true }),
        relationField('defaultCreditTypeId', 'credit_types', { required: true }),
        dateField('termStart'),
        dateField('termEnd'),
        numberField('capacity', { min: 1 }),
        textField('location'),
        selectField('status', ['draft', 'active', 'completed', 'cancelled'], { required: true }),
        jsonField('metadata'),
    ], [
        'CREATE UNIQUE INDEX idx_classes_code ON classes (code)',
        'CREATE INDEX idx_classes_status_term ON classes (status, termStart)',
    ]),
    collection('class_students', [
        relationField('classId', 'classes', { required: true }),
        relationField('studentId', 'students', { required: true }),
        selectField('status', ['invited', 'active', 'paused', 'completed', 'cancelled'], { required: true }),
        dateField('effectiveFrom', { required: true }),
        dateField('effectiveTo'),
        relationField('sourceOrderId', 'orders'),
    ], [
        'CREATE UNIQUE INDEX idx_class_students_effective ON class_students (classId, studentId, effectiveFrom)',
        'CREATE UNIQUE INDEX idx_class_students_open ON class_students (classId, studentId) WHERE effectiveTo IS NULL OR effectiveTo = \'\'',
        'CREATE INDEX idx_class_students_student_status ON class_students (studentId, status)',
    ]),
    collection('class_teachers', [
        relationField('classId', 'classes', { required: true }),
        relationField('teacherId', 'teachers', { required: true }),
        selectField('role', ['lead', 'assistant', 'observer', 'evaluator'], { required: true }),
        selectField('status', ['active', 'inactive'], { required: true }),
        dateField('effectiveFrom', { required: true }),
        dateField('effectiveTo'),
    ], [
        'CREATE UNIQUE INDEX idx_class_teachers_open ON class_teachers (classId, teacherId, role) WHERE effectiveTo IS NULL OR effectiveTo = \'\'',
        'CREATE INDEX idx_class_teachers_class_status ON class_teachers (classId, status)',
        'CREATE INDEX idx_class_teachers_teacher_status ON class_teachers (teacherId, status)',
    ]),
    collection('sessions', [
        textField('code', { required: true }),
        textField('title', { required: true }),
        selectField('status', ['draft', 'scheduled', 'enrollment_closed', 'in_progress', 'completed', 'settled', 'cancelled', 'correction_pending'], { required: true }),
        dateField('startAt', { required: true }),
        dateField('endAt', { required: true }),
        textField('location'),
        relationField('requiredCreditTypeId', 'credit_types', { required: true }),
        numberField('requiredQuantity', { required: true, min: 1 }),
        jsonField('attendanceRuleSnapshot', { required: true }),
        jsonField('settlementRuleSnapshot', { required: true }),
        jsonField('teacherRuleSnapshot', { required: true }),
        numberField('rosterVersion', { required: true, min: 1 }),
        numberField('version', { required: true, min: 1 }),
        relationField('settlementOperationId', 'credit_operations'),
        selectField('correctionBaseStatus', ['completed', 'cancelled']),
    ], [
        'CREATE UNIQUE INDEX idx_sessions_code ON sessions (code)',
        'CREATE INDEX idx_sessions_status_start ON sessions (status, startAt)',
    ]),
    collection('session_classes', [
        relationField('sessionId', 'sessions', { required: true }),
        relationField('classId', 'classes', { required: true }),
    ], [
        'CREATE UNIQUE INDEX idx_session_classes_unique ON session_classes (sessionId, classId)',
    ]),
    collection('session_students', [
        relationField('sessionId', 'sessions', { required: true }),
        relationField('studentId', 'students', { required: true }),
        jsonField('sourceClassIds'),
        selectField('attendanceStatus', ['scheduled', 'checked_in', 'present', 'late', 'leave', 'absent', 'cancelled'], { required: true }),
        selectField('creditStatus', [
            'pending', 'credit_insufficient', 'conversion_required', 'reserved', 'consumed',
            'released', 'reversed', 'not_charged',
        ], { required: true }),
        textField('eligibilityReason'),
        dateField('checkedInAt'),
        dateField('settledAt'),
        numberField('version', { required: true, min: 1 }),
    ], [
        'CREATE UNIQUE INDEX idx_session_students_unique ON session_students (sessionId, studentId)',
        'CREATE INDEX idx_session_students_credit_status ON session_students (creditStatus, sessionId)',
    ]),
    collection('session_teachers', [
        relationField('sessionId', 'sessions', { required: true }),
        relationField('teacherId', 'teachers', { required: true }),
        selectField('role', ['lead', 'assistant', 'observer', 'evaluator'], { required: true }),
        selectField('assignmentSource', ['class_default', 'session_override', 'substitute'], { required: true }),
        selectField('actualStatus', ['planned', 'confirmed', 'absent', 'cancelled'], { required: true }),
        selectField('creditStatus', ['not_eligible', 'pending', 'confirmed', 'reversed'], { required: true }),
    ], [
        'CREATE UNIQUE INDEX idx_session_teachers_unique ON session_teachers (sessionId, teacherId, role)',
    ]),
    collection('session_credit_allocations', [
        relationField('sessionStudentId', 'session_students', { required: true }),
        relationField('batchId', 'credit_batches', { required: true }),
        numberField('quantity', { required: true, min: 1 }),
        selectField('status', ['reserved', 'consumed', 'released', 'expired', 'reversed'], { required: true }),
        dateField('reservedForStartAt', { required: true }),
        relationField('operationId', 'credit_operations', { required: true }),
    ], [
        'CREATE INDEX idx_session_credit_allocations_student_status ON session_credit_allocations (sessionStudentId, status)',
        'CREATE INDEX idx_session_credit_allocations_batch_status ON session_credit_allocations (batchId, status)',
    ]),
    collection('teacher_credit_rules', [
        relationField('courseSpecId', 'course_specs', { required: true }),
        selectField('role', ['lead', 'assistant', 'observer', 'evaluator'], { required: true }),
        numberField('baseQuantity', { min: 0, onlyInt: false }),
        numberField('durationFactor', { min: 0, onlyInt: false }),
        numberField('participantFactor', { min: 0, onlyInt: false }),
        jsonField('cancellationCompensation'),
        dateField('validFrom', { required: true }),
        dateField('validTo'),
        numberField('version', { required: true, min: 1 }),
        selectField('status', ['draft', 'active', 'inactive'], { required: true }),
    ], [
        'CREATE UNIQUE INDEX idx_teacher_credit_rules_version ON teacher_credit_rules (courseSpecId, role, version)',
    ]),
    collection('teacher_credit_events', [
        relationField('sessionTeacherId', 'session_teachers'),
        relationField('teacherId', 'teachers', { required: true }),
        relationField('ruleId', 'teacher_credit_rules'),
        selectField('eventType', ['earn', 'compensate', 'confirm', 'reverse', 'adjust'], { required: true }),
        numberField('quantityDelta', { required: true, onlyInt: false }),
        selectField('status', ['pending', 'confirmed', 'reversed'], { required: true }),
        relationField('operationId', 'credit_operations', { required: true }),
        relationField('confirmationOfEventId', 'teacher_credit_events'),
        relationField('reversalOfEventId', 'teacher_credit_events'),
        textField('reason'),
    ], [
        'CREATE INDEX idx_teacher_credit_events_teacher_created ON teacher_credit_events (teacherId, created)',
        'CREATE INDEX idx_teacher_credit_events_session_teacher ON teacher_credit_events (sessionTeacherId)',
        'CREATE UNIQUE INDEX idx_teacher_credit_events_confirmation ON teacher_credit_events (confirmationOfEventId) WHERE confirmationOfEventId IS NOT NULL AND confirmationOfEventId != \'\'',
    ]),
    collection('outbox_events', [
        textField('topic', { required: true }),
        textField('aggregateType', { required: true }),
        textField('aggregateId', { required: true }),
        jsonField('payload', { required: true }),
        selectField('status', ['pending', 'processing', 'sent', 'failed', 'dead_letter'], { required: true }),
        numberField('attempts', { min: 0 }),
        dateField('nextAttemptAt'),
        dateField('processingStartedAt'),
        dateField('sentAt'),
        textField('lastErrorCode'),
        dateField('lastErrorAt'),
        dateField('deadLetterAt'),
    ], [
        'CREATE INDEX idx_outbox_events_delivery ON outbox_events (status, nextAttemptAt)',
    ]),
    collection('reconciliation_runs', [
        textField('scope', { required: true }),
        selectField('status', ['pending', 'running', 'passed', 'failed'], { required: true }),
        dateField('startedAt'),
        dateField('finishedAt'),
        numberField('differenceCount', { min: 0 }),
        jsonField('report'),
    ], [
        'CREATE INDEX idx_reconciliation_runs_status_created ON reconciliation_runs (status, created)',
    ]),
    collection('reconciliation_exceptions', [
        relationField('runId', 'reconciliation_runs', { required: true }),
        relationField('batchId', 'credit_batches', { required: true }),
        textField('code', { required: true }),
        textField('field', { required: true }),
        numberField('expectedValue', { onlyInt: false }),
        numberField('actualValue', { onlyInt: false }),
        jsonField('details', { required: true }),
        selectField('status', ['open', 'acknowledged', 'resolved'], { required: true }),
        dateField('detectedAt', { required: true }),
    ], [
        'CREATE INDEX idx_reconciliation_exceptions_run ON reconciliation_exceptions (runId, batchId)',
        'CREATE INDEX idx_reconciliation_exceptions_status_created ON reconciliation_exceptions (status, created)',
    ]),
];

const CALENDAR_INDEX_DEFINITIONS = Object.freeze([
    {
        collectionName: 'sessions',
        index: 'CREATE INDEX idx_sessions_calendar_range ON sessions (startAt, endAt, status)',
    },
    {
        collectionName: 'session_classes',
        index: 'CREATE INDEX idx_session_classes_class_session ON session_classes (classId, sessionId)',
    },
    {
        collectionName: 'session_students',
        index: 'CREATE INDEX idx_session_students_student_session ON session_students (studentId, sessionId, attendanceStatus)',
    },
    {
        collectionName: 'session_teachers',
        index: 'CREATE INDEX idx_session_teachers_teacher_session ON session_teachers (teacherId, sessionId, actualStatus)',
    },
]);

const TEACHING_SCHEMAS = BASE_TEACHING_SCHEMAS.map((schema) => {
    if (schema.name === 'sessions') {
        return extendFields(schema, [
            selectField('originType', ['class', 'appointment', 'admin', 'migration'], { required: true }),
            relationField('appointmentId', 'appointment_requests'),
            selectField('cancellationType', ['student', 'teacher', 'institution', 'admin']),
            dateField('cancelledAt'),
        ]);
    }
    if (schema.name === 'session_teachers') {
        return {
            ...schema,
            fields: schema.fields.map((field) => field.name === 'assignmentSource'
                ? selectField('assignmentSource', ['class_default', 'session_override', 'substitute', 'appointment'], { required: true })
                : field),
        };
    }
    return schema;
});

function extendFields(schema, fields) {
    const timestamps = schema.fields.slice(-2);
    return { ...schema, fields: [...schema.fields.slice(0, -2), ...fields, ...timestamps] };
}

module.exports = { BASE_TEACHING_SCHEMAS, CALENDAR_INDEX_DEFINITIONS, TEACHING_SCHEMAS };
