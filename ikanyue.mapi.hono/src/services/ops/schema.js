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
