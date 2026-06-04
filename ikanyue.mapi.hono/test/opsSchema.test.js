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
        'activity_signups',
        'teacher_student_relations',
        'learning_programs',
        'learning_sessions',
        'program_students',
        'program_teachers',
        'session_students',
        'session_teachers',
        'report_templates',
        'report_events',
        'evaluation_inputs',
        'report_instances',
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

    const signups = fieldNames(schemas.get('activity_signups'));
    assert.ok(signups.has('userId'));
    assert.ok(signups.has('activityId'));
    assert.ok(signups.has('status'));
    assert.ok(schemas.get('activity_signups').indexes.some((index) => index.includes('idx_activity_signups_user_activity')));

    const programs = fieldNames(schemas.get('learning_programs'));
    assert.ok(programs.has('plannedSessionCount'));
    assert.ok(programs.has('plannedStartAt'));
    assert.ok(programs.has('metadata'));

    const sessions = fieldNames(schemas.get('learning_sessions'));
    assert.ok(sessions.has('programId'));
    assert.ok(sessions.has('theme'));
    assert.ok(sessions.has('sequence'));

    const reportEvents = fieldNames(schemas.get('report_events'));
    assert.ok(reportEvents.has('scopeType'));
    assert.ok(reportEvents.has('scopeId'));
    assert.ok(reportEvents.has('subjectRulesJson'));
    assert.ok(schemas.get('report_events').indexes.some((index) => index.includes('idx_report_events_scope_status')));

    const reportInstances = fieldNames(schemas.get('report_instances'));
    assert.ok(reportInstances.has('subjectType'));
    assert.ok(reportInstances.has('recipientType'));
    assert.ok(reportInstances.has('sourceType'));
    assert.ok(schemas.get('report_instances').indexes.some((index) => index.includes('idx_report_instances_recipient_status')));
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
