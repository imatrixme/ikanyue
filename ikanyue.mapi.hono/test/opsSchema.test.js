const test = require('node:test');
const assert = require('node:assert/strict');

const { OPS_COLLECTION_SCHEMAS, validateOpsSchemas } = require('../src/services/ops/schema');

test('ops schema defines only the light branch point and reward collections', () => {
    const validation = validateOpsSchemas();
    assert.equal(validation.ok, true);

    const schemas = new Map(OPS_COLLECTION_SCHEMAS.map((schema) => [schema.name, schema]));
    for (const name of [
        'reward_items',
        'student_points',
        'point_events',
        'ops_audit_logs',
    ]) {
        assert.ok(schemas.has(name), `${name} should be defined`);
    }
    assert.equal(schemas.has('assessment_templates'), false);
    assert.equal(schemas.has('operation_slots'), false);
    assert.equal(schemas.has('activity_signups'), false);

    const rewards = fieldNames(schemas.get('reward_items'));
    assert.ok(rewards.has('name'));
    assert.ok(rewards.has('pointsPrice'));
    assert.ok(rewards.has('status'));
    assert.ok(schemas.get('reward_items').indexes.some((index) => index.includes('idx_reward_items_status_sort')));

    const accounts = fieldNames(schemas.get('student_points'));
    assert.ok(accounts.has('studentId'));
    assert.ok(accounts.has('balance'));
    assert.ok(schemas.get('student_points').indexes.some((index) => index.includes('UNIQUE')));

    const events = fieldNames(schemas.get('point_events'));
    assert.ok(events.has('studentId'));
    assert.ok(events.has('type'));
    assert.ok(events.has('delta'));
    assert.ok(events.has('balanceAfter'));
    assert.ok(events.has('rewardSnapshot'));
    assert.ok(schemas.get('point_events').indexes.some((index) => index.includes('idx_point_events_student_created')));

    const auditLogs = fieldNames(schemas.get('ops_audit_logs'));
    assert.ok(auditLogs.has('action'));
    assert.ok(auditLogs.has('resourceType'));
    assert.ok(auditLogs.has('metadata'));
});

test('ops schema validator reports incomplete collections', () => {
    const validation = validateOpsSchemas([{ name: 'broken', fields: [{ name: 'title' }] }]);
    assert.equal(validation.ok, false);
    assert.ok(validation.errors.some((error) => error.includes('created')));
    assert.ok(validation.errors.some((error) => error.includes('不完整字段')));
});

function fieldNames(schema) {
    return new Set(schema.fields.map((field) => field.name));
}
