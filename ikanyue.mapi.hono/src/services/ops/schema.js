const OPS_COLLECTION_SCHEMAS = [
    collection('assessment_templates', [
        textField('name', { required: true }),
        numberField('version'),
        selectField('status', ['draft', 'published', 'archived'], { required: true }),
        jsonField('schemaJson', { required: true }),
        jsonField('scoringJson'),
        jsonField('reportJson'),
        textField('createdBy'),
    ], [
        'CREATE INDEX idx_assessment_templates_status_created ON assessment_templates (status, created)',
    ]),
    collection('assessment_records', [
        relationField('studentId', 'students', { required: true }),
        relationField('teacherId', 'teachers', { required: true }),
        relationField('templateId', 'assessment_templates', { required: true }),
        selectField('status', ['draft', 'submitted'], { required: true }),
        jsonField('answersJson'),
        jsonField('scoreJson'),
        dateField('submittedAt'),
    ], [
        'CREATE INDEX idx_assessment_records_student_created ON assessment_records (studentId, created)',
        'CREATE INDEX idx_assessment_records_teacher_created ON assessment_records (teacherId, created)',
    ]),
    collection('assessment_report_snapshots', [
        relationField('assessmentRecordId', 'assessment_records', { required: true }),
        relationField('studentId', 'students', { required: true }),
        relationField('teacherId', 'teachers', { required: true }),
        relationField('templateId', 'assessment_templates', { required: true }),
        numberField('totalScore'),
        textField('grade'),
        jsonField('reportJson', { required: true }),
    ], [
        'CREATE INDEX idx_assessment_reports_student_created ON assessment_report_snapshots (studentId, created)',
        'CREATE INDEX idx_assessment_reports_teacher_created ON assessment_report_snapshots (teacherId, created)',
    ]),
    collection('assessment_share_links', [
        relationField('reportId', 'assessment_report_snapshots', { required: true }),
        textField('tokenHash', { required: true }),
        relationField('createdBy', 'teachers'),
        dateField('expiresAt'),
        dateField('revokedAt'),
        numberField('accessCount'),
    ], [
        'CREATE UNIQUE INDEX idx_assessment_share_links_token_hash ON assessment_share_links (tokenHash)',
        'CREATE INDEX idx_assessment_share_links_report_id ON assessment_share_links (reportId)',
    ]),
    collection('teacher_student_relations', [
        relationField('teacherId', 'teachers', { required: true }),
        relationField('studentId', 'students', { required: true }),
        selectField('status', ['active', 'inactive'], { required: true }),
    ], [
        'CREATE UNIQUE INDEX idx_teacher_student_relations_pair ON teacher_student_relations (teacherId, studentId)',
    ]),
    collection('learning_programs', [
        textField('title', { required: true }),
        selectField('type', ['course_package', 'trial', 'activity', 'custom'], { required: true }),
        selectField('status', ['draft', 'active', 'completed', 'cancelled'], { required: true }),
        textField('description'),
        numberField('plannedSessionCount'),
        dateField('plannedStartAt'),
        dateField('plannedEndAt'),
        jsonField('metadata'),
    ], [
        'CREATE INDEX idx_learning_programs_status_updated ON learning_programs (status, updated)',
        'CREATE INDEX idx_learning_programs_type_status ON learning_programs (type, status)',
    ]),
    collection('learning_sessions', [
        relationField('programId', 'learning_programs'),
        textField('title', { required: true }),
        textField('theme'),
        selectField('status', ['planned', 'completed', 'cancelled'], { required: true }),
        numberField('sequence'),
        dateField('startTime'),
        dateField('endTime'),
        jsonField('metadata'),
    ], [
        'CREATE INDEX idx_learning_sessions_program_sequence ON learning_sessions (programId, sequence)',
        'CREATE INDEX idx_learning_sessions_status_start ON learning_sessions (status, startTime)',
    ]),
    collection('program_students', [
        relationField('programId', 'learning_programs', { required: true }),
        relationField('studentId', 'students', { required: true }),
        selectField('status', ['invited', 'registered', 'active', 'paused', 'completed', 'cancelled'], { required: true }),
        jsonField('metadata'),
    ], [
        'CREATE UNIQUE INDEX idx_program_students_pair ON program_students (programId, studentId)',
        'CREATE INDEX idx_program_students_student_status ON program_students (studentId, status)',
    ]),
    collection('program_teachers', [
        relationField('programId', 'learning_programs', { required: true }),
        relationField('teacherId', 'teachers', { required: true }),
        selectField('role', ['lead', 'assistant', 'evaluator', 'observer'], { required: true }),
        selectField('status', ['active', 'inactive'], { required: true }),
        jsonField('metadata'),
    ], [
        'CREATE UNIQUE INDEX idx_program_teachers_pair_role ON program_teachers (programId, teacherId, role)',
        'CREATE INDEX idx_program_teachers_teacher_status ON program_teachers (teacherId, status)',
    ]),
    collection('session_students', [
        relationField('sessionId', 'learning_sessions', { required: true }),
        relationField('studentId', 'students', { required: true }),
        selectField('status', ['scheduled', 'present', 'absent', 'late', 'leave'], { required: true }),
        jsonField('metadata'),
    ], [
        'CREATE UNIQUE INDEX idx_session_students_pair ON session_students (sessionId, studentId)',
        'CREATE INDEX idx_session_students_student_status ON session_students (studentId, status)',
    ]),
    collection('session_teachers', [
        relationField('sessionId', 'learning_sessions', { required: true }),
        relationField('teacherId', 'teachers', { required: true }),
        selectField('role', ['lead', 'assistant', 'evaluator', 'observer'], { required: true }),
        selectField('status', ['active', 'inactive'], { required: true }),
        jsonField('metadata'),
    ], [
        'CREATE UNIQUE INDEX idx_session_teachers_pair_role ON session_teachers (sessionId, teacherId, role)',
        'CREATE INDEX idx_session_teachers_teacher_status ON session_teachers (teacherId, status)',
    ]),
    collection('report_templates', [
        textField('name', { required: true }),
        numberField('version'),
        textField('reportType', { required: true }),
        selectField('status', ['draft', 'published', 'archived'], { required: true }),
        jsonField('schemaJson', { required: true }),
        jsonField('reportJson'),
        textField('createdBy'),
    ], [
        'CREATE INDEX idx_report_templates_type_status ON report_templates (reportType, status)',
        'CREATE INDEX idx_report_templates_status_updated ON report_templates (status, updated)',
    ]),
    collection('report_events', [
        textField('title', { required: true }),
        textField('reportType', { required: true }),
        relationField('templateId', 'report_templates', { required: true }),
        selectField('scopeType', ['program', 'session', 'activity', 'custom'], { required: true }),
        textField('scopeId', { required: true }),
        relationField('programId', 'learning_programs'),
        relationField('sessionId', 'learning_sessions'),
        selectField('status', ['draft', 'open', 'closed', 'published', 'cancelled'], { required: true }),
        relationField('createdBy', 'teachers'),
        jsonField('subjectRulesJson'),
        jsonField('recipientRulesJson'),
        jsonField('metadata'),
    ], [
        'CREATE INDEX idx_report_events_scope_status ON report_events (scopeType, scopeId, status)',
        'CREATE INDEX idx_report_events_template_status ON report_events (templateId, status)',
    ]),
    collection('evaluation_inputs', [
        relationField('eventId', 'report_events', { required: true }),
        relationField('templateId', 'report_templates'),
        selectField('evaluatorType', ['teacher', 'student', 'admin', 'external'], { required: true }),
        textField('evaluatorId', { required: true }),
        selectField('targetType', ['student', 'teacher', 'program', 'session', 'activity', 'custom'], { required: true }),
        textField('targetId', { required: true }),
        selectField('status', ['draft', 'submitted', 'void'], { required: true }),
        jsonField('answersJson'),
        jsonField('scoreJson'),
        dateField('submittedAt'),
    ], [
        'CREATE INDEX idx_evaluation_inputs_event_target ON evaluation_inputs (eventId, targetType, targetId)',
        'CREATE INDEX idx_evaluation_inputs_evaluator_status ON evaluation_inputs (evaluatorType, evaluatorId, status)',
    ]),
    collection('report_instances', [
        relationField('eventId', 'report_events'),
        relationField('templateId', 'report_templates'),
        textField('reportType', { required: true }),
        selectField('scopeType', ['program', 'session', 'activity', 'assessment', 'custom'], { required: true }),
        textField('scopeId'),
        selectField('subjectType', ['student', 'teacher', 'program', 'session', 'activity', 'custom'], { required: true }),
        textField('subjectId', { required: true }),
        selectField('recipientType', ['student', 'teacher', 'admin'], { required: true }),
        textField('recipientId', { required: true }),
        selectField('status', ['draft', 'published', 'revoked'], { required: true }),
        textField('sourceType'),
        textField('sourceId'),
        numberField('totalScore'),
        textField('grade'),
        jsonField('reportJson', { required: true }),
        jsonField('inputIdsJson'),
        dateField('publishedAt'),
    ], [
        'CREATE INDEX idx_report_instances_recipient_status ON report_instances (recipientType, recipientId, status)',
        'CREATE INDEX idx_report_instances_subject_scope ON report_instances (subjectType, subjectId, scopeType, scopeId)',
        'CREATE UNIQUE INDEX idx_report_instances_source ON report_instances (sourceType, sourceId)',
    ]),
    collection('operation_slots', [
        selectField('channel', ['wechat-mini', 'alipay-mini', 'app', 'web'], { required: true }),
        textField('placement', { required: true }),
        textField('title', { required: true }),
        textField('description'),
        selectField('status', ['draft', 'active', 'disabled'], { required: true }),
        numberField('sortOrder'),
        dateField('visibleFrom'),
        dateField('visibleTo'),
        urlField('imageUrl'),
        selectField('targetType', ['activity', 'audio', 'video', 'assessment_report', 'webview', 'none']),
        textField('targetId'),
        urlField('targetUrl'),
        jsonField('metadata'),
    ], [
        'CREATE INDEX idx_operation_slots_public ON operation_slots (channel, placement, status, sortOrder)',
    ]),
    collection('ops_rich_text_assets', [
        textField('title', { required: true }),
        fileField('image', {
            required: true,
            maxSize: 10 * 1024 * 1024,
            mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
            thumbs: ['320x240', '960x0'],
        }),
        textField('mimeType'),
        numberField('size'),
        textField('source'),
        relationField('createdBy', 'teachers'),
        jsonField('metadata'),
    ], [
        'CREATE INDEX idx_ops_rich_text_assets_created_by ON ops_rich_text_assets (createdBy, created)',
    ]),
    collection('activity_signups', [
        relationField('userId', 'students', { required: true }),
        relationField('activityId', 'activities', { required: true }),
        textField('realName', { required: true }),
        numberField('age'),
        selectField('status', ['registered', 'cancelled', 'attended', 'no_show'], { required: true }),
        textField('remark'),
    ], [
        'CREATE UNIQUE INDEX idx_activity_signups_user_activity ON activity_signups (userId, activityId)',
        'CREATE INDEX idx_activity_signups_activity_status ON activity_signups (activityId, status)',
    ]),
    collection('ops_audit_logs', [
        relationField('actorId', 'teachers'),
        selectField('actorRole', ['teacher', 'admin']),
        textField('action', { required: true }),
        textField('resourceType'),
        textField('resourceId'),
        selectField('outcome', ['allowed', 'denied', 'success', 'failed'], { required: true }),
        jsonField('metadata'),
    ], [
        'CREATE INDEX idx_ops_audit_logs_actor_created ON ops_audit_logs (actorId, created)',
        'CREATE INDEX idx_ops_audit_logs_resource_created ON ops_audit_logs (resourceType, resourceId, created)',
    ]),
];

function collection(name, fields, indexes = []) {
    return {
        name,
        type: 'base',
        fields: [
            ...fields,
            { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
            { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes,
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
    };
}

function textField(name, options = {}) {
    return { name, type: 'text', required: Boolean(options.required), max: options.max || 0 };
}

function urlField(name) {
    return { name, type: 'url', required: false };
}

function numberField(name) {
    return { name, type: 'number', required: false, min: null, max: null };
}

function dateField(name) {
    return { name, type: 'date', required: false };
}

function fileField(name, options = {}) {
    return {
        name,
        type: 'file',
        required: Boolean(options.required),
        maxSelect: options.maxSelect || 1,
        maxSize: options.maxSize || 0,
        mimeTypes: options.mimeTypes || [],
        thumbs: options.thumbs || [],
    };
}

function jsonField(name, options = {}) {
    return { name, type: 'json', required: Boolean(options.required) };
}

function selectField(name, values, options = {}) {
    return { name, type: 'select', required: Boolean(options.required), values, maxSelect: 1 };
}

function relationField(name, collectionName, options = {}) {
    return {
        name,
        type: 'relation',
        required: Boolean(options.required),
        collectionName,
        cascadeDelete: false,
        minSelect: 0,
        maxSelect: 1,
    };
}

function validateOpsSchemas(schemas = OPS_COLLECTION_SCHEMAS) {
    const errors = [];
    for (const schema of schemas) {
        if (!schema.name || !Array.isArray(schema.fields)) {
            errors.push(`${schema.name || 'unknown'} 缺少集合名称或字段定义`);
            continue;
        }
        const names = new Set(schema.fields.map((field) => field.name));
        for (const required of ['created', 'updated']) {
            if (!names.has(required)) {
                errors.push(`${schema.name} 缺少 ${required} 字段`);
            }
        }
        for (const field of schema.fields) {
            if (!field.name || !field.type) {
                errors.push(`${schema.name} 存在不完整字段定义`);
            }
        }
    }
    return { ok: errors.length === 0, errors };
}

module.exports = {
    OPS_COLLECTION_SCHEMAS,
    validateOpsSchemas,
};
