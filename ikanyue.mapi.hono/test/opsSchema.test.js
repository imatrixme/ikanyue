const test = require('node:test');
const assert = require('node:assert/strict');

const { OPS_COLLECTION_SCHEMAS, validateOpsSchemas } = require('../src/services/ops/schema');

test('ops schema defines production PocketBase collections for admin workflows', () => {
    const validation = validateOpsSchemas();
    assert.equal(validation.ok, true);

    const schemas = new Map(OPS_COLLECTION_SCHEMAS.map((schema) => [schema.name, schema]));
    for (const name of [
        'assessment_templates',
        'assessment_records',
        'assessment_report_snapshots',
        'assessment_share_links',
        'teacher_student_relations',
        'operation_slots',
        'ops_audit_logs',
    ]) {
        assert.ok(schemas.has(name), `${name} should be defined`);
    }

    const operationSlots = fieldNames(schemas.get('operation_slots'));
    assert.ok(operationSlots.has('channel'));
    assert.ok(operationSlots.has('placement'));
    assert.ok(operationSlots.has('targetType'));
    assert.ok(operationSlots.has('targetUrl'));
    assert.ok(operationSlots.has('imageUrl'));
    assert.ok(schemas.get('operation_slots').indexes.some((index) => index.includes('idx_operation_slots_public')));

    const shareLinks = fieldNames(schemas.get('assessment_share_links'));
    assert.ok(shareLinks.has('tokenHash'));
    assert.ok(shareLinks.has('revokedAt'));
    assert.ok(schemas.get('assessment_share_links').indexes.some((index) => index.includes('UNIQUE')));
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
