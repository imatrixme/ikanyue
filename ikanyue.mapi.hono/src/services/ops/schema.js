const OPS_COLLECTION_SCHEMAS = [
    collection('reward_items', [
        textField('name', { required: true }),
        textField('description'),
        urlField('image'),
        numberField('pointsPrice'),
        selectField('status', ['active', 'inactive'], { required: true }),
        numberField('sortOrder'),
    ], [
        'CREATE INDEX idx_reward_items_status_sort ON reward_items (status, sortOrder)',
    ]),
    collection('student_points', [
        relationField('studentId', 'students', { required: true }),
        numberField('balance'),
    ], [
        'CREATE UNIQUE INDEX idx_student_points_student ON student_points (studentId)',
    ]),
    collection('point_events', [
        relationField('studentId', 'students', { required: true }),
        selectField('type', ['earn', 'offline_redeem', 'manual_adjust'], { required: true }),
        numberField('delta'),
        numberField('balanceAfter'),
        textField('operatorId'),
        textField('operatorRole'),
        textField('reason'),
        textField('remark'),
        textField('rewardItemId'),
        jsonField('rewardSnapshot'),
    ], [
        'CREATE INDEX idx_point_events_student_created ON point_events (studentId, created)',
        'CREATE INDEX idx_point_events_reward_created ON point_events (rewardItemId, created)',
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
