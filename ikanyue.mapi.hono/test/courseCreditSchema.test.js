const test = require('node:test');
const assert = require('node:assert/strict');

const {
    COURSE_CREDIT_COLLECTION_SCHEMAS,
    APPEND_ONLY_COURSE_CREDIT_COLLECTIONS,
    VERSIONED_COURSE_CREDIT_COLLECTIONS,
    validateCourseCreditSchemas,
} = require('../src/services/courseCredits/schema');
const {
    CALENDAR_INDEX_DEFINITIONS,
} = require('../src/services/courseCredits/schema/teachingSchemas');
const { COURSE_CREDIT_SEED } = require('../scripts/fixtures/course-credit-seed');
const { applyOpsSchemas } = require('../scripts/lib/points-lite-bootstrap');

test('course credit schema defines the complete private collection set in dependency order', () => {
    const validation = validateCourseCreditSchemas();
    assert.deepEqual(validation, { ok: true, errors: [] });

    const names = COURSE_CREDIT_COLLECTION_SCHEMAS.map((schema) => schema.name);
    for (const name of [
        'course_specs', 'credit_types', 'packages', 'package_grant_lines', 'price_versions',
        'orders', 'payment_events', 'credit_operations', 'credit_version_claims', 'credit_batches', 'credit_events',
        'credit_expiry_changes', 'conversion_rules', 'conversion_authorizations', 'conversion_allocations', 'classes',
        'class_students', 'class_teachers', 'sessions', 'session_classes', 'session_students',
        'session_teachers', 'session_credit_allocations', 'teacher_credit_rules', 'teacher_credit_events',
        'outbox_events', 'reconciliation_runs', 'reconciliation_exceptions', 'booking_policies',
        'teacher_course_offerings', 'teacher_availability_rules', 'teacher_availability_overrides',
        'appointment_requests', 'appointment_events', 'schedule_claims', 'booking_conflicts', 'wechat_identities',
    ]) {
        assert.ok(names.includes(name), `${name} should be defined`);
    }

    const byName = new Map(COURSE_CREDIT_COLLECTION_SCHEMAS.map((schema) => [schema.name, schema]));
    assert.ok(indexes(byName.get('course_specs')).some((index) => index.includes('UNIQUE')));
    assert.ok(indexes(byName.get('credit_types')).some((index) => index.includes('kind, status')));
    assert.ok(indexes(byName.get('payment_events')).some((index) => index.includes('providerEventId')));
    assert.ok(indexes(byName.get('credit_operations')).some((index) => index.includes('idempotencyKey')));
    assert.ok(indexes(byName.get('credit_batches')).some((index) => index.includes('effectiveExpiresAt')));
    assert.ok(indexes(byName.get('session_students')).some((index) => index.includes('sessionId, studentId')));
    assert.ok(indexes(byName.get('class_students')).some((index) => index.includes("effectiveTo = ''")));
    assert.ok(indexes(byName.get('class_teachers')).some((index) => index.includes("effectiveTo = ''")));
    assert.ok(indexes(byName.get('schedule_claims')).some((index) => index.includes('WHERE status = \'active\'')));
    assert.ok(indexes(byName.get('appointment_requests')).some((index) => index.includes("status = 'pending'")));
    assert.deepEqual(CALENDAR_INDEX_DEFINITIONS.map(({ collectionName }) => collectionName), [
        'sessions', 'session_classes', 'session_students', 'session_teachers',
    ]);
    assert.ok(CALENDAR_INDEX_DEFINITIONS.some(({ index }) => index.includes('startAt, endAt, status')));
    assert.ok(CALENDAR_INDEX_DEFINITIONS.some(({ index }) => index.includes('classId, sessionId')));
    assert.ok(CALENDAR_INDEX_DEFINITIONS
        .some(({ index }) => index.includes('studentId, sessionId, attendanceStatus')));
    assert.ok(CALENDAR_INDEX_DEFINITIONS
        .some(({ index }) => index.includes('teacherId, sessionId, actualStatus')));

    for (const schema of COURSE_CREDIT_COLLECTION_SCHEMAS) {
        assert.equal(schema.createRule, null);
        assert.equal(schema.updateRule, null);
        assert.equal(schema.deleteRule, null);
    }
});

test('course credit schema validator rejects duplicate, incomplete, and public schemas', () => {
    const schemas = [
        { name: 'no-fields', fields: null, listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null },
        { name: 'broken', fields: [{ name: 'id' }], listRule: null, viewRule: null, createRule: '', updateRule: null, deleteRule: null },
        { name: 'broken', fields: [{ name: 'created', type: 'date' }, { name: 'created', type: 'date' }, { name: 'updated', type: 'date' }], listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null },
    ];
    const validation = validateCourseCreditSchemas(schemas);
    assert.equal(validation.ok, false);
    assert.ok(validation.errors.some((error) => error.includes('defined more than once')));
    assert.ok(validation.errors.some((error) => error.includes('incomplete field')));
    assert.ok(validation.errors.some((error) => error.includes('missing created')));
    assert.ok(validation.errors.some((error) => error.includes('missing collection name or fields')));
    assert.ok(validation.errors.some((error) => error.includes('created is defined more than once')));
    assert.ok(validation.errors.some((error) => error.includes('createRule must deny public access')));
});

test('immutable collections and representative fields reflect the ledger contract', () => {
    assert.deepEqual([...APPEND_ONLY_COURSE_CREDIT_COLLECTIONS].sort(), [
        'appointment_events', 'conversion_allocations', 'credit_events', 'credit_expiry_changes',
        'credit_version_claims', 'payment_events', 'teacher_credit_events',
    ]);
    assert.deepEqual([...VERSIONED_COURSE_CREDIT_COLLECTIONS].sort(), [
        'conversion_rules', 'price_versions', 'teacher_credit_rules',
    ]);
    const byName = new Map(COURSE_CREDIT_COLLECTION_SCHEMAS.map((schema) => [schema.name, schema]));
    assert.equal(field(byName.get('credit_types'), 'consumable').type, 'bool');
    assert.deepEqual(field(byName.get('credit_batches'), 'activationMode').values, [
        'GRANT_TIME', 'FIRST_RESERVATION', 'FIRST_CHECK_IN', 'FIRST_COMPLETED_SESSION', 'TERM_START',
    ]);
    assert.equal(field(byName.get('credit_batches'), 'originalQuantity').onlyInt, true);
    assert.equal(field(byName.get('credit_batches'), 'frozenQuantity').required, false);
    assert.equal(field(byName.get('credit_batches'), 'paidUnitCost').onlyInt, false);
    assert.equal(field(byName.get('credit_batches'), 'compensationSourceBatchId').collectionName, 'credit_batches');
    assert.equal(field(byName.get('conversion_authorizations'), 'requestFingerprint').required, true);
    assert.equal(field(byName.get('credit_types'), 'consumable').required, false);
    assert.equal(field(byName.get('course_specs'), 'defaultCreditTypeId').collectionName, 'credit_types');
    assert.equal(field(byName.get('credit_operations'), 'studentId').required, false);
    assert.equal(field(byName.get('credit_operations'), 'reason').required, true);
    assert.deepEqual(field(byName.get('credit_operations'), 'outcome').values, ['committed', 'failed', 'denied']);
    assert.equal(field(byName.get('credit_operations'), 'beforeSummary').type, 'json');
    assert.equal(field(byName.get('credit_operations'), 'afterSummary').required, true);
    assert.equal(field(byName.get('sessions'), 'version').required, true);
    assert.deepEqual(field(byName.get('sessions'), 'originType').values, ['class', 'appointment', 'admin', 'migration']);
    assert.equal(field(byName.get('session_students'), 'creditStatus').values.includes('not_charged'), true);
    assert.equal(field(byName.get('teacher_credit_events'), 'sessionTeacherId').required, false);
    assert.equal(field(byName.get('sessions'), 'appointmentId').collectionName, 'appointment_requests');
    assert.equal(field(byName.get('session_students'), 'sourceClassIds').type, 'json');
    assert.ok(field(byName.get('session_teachers'), 'assignmentSource').values.includes('appointment'));
    assert.equal(field(byName.get('teacher_credit_rules'), 'cancellationCompensation').type, 'json');
    assert.equal(field(byName.get('teacher_credit_events'), 'confirmationOfEventId').collectionName,
        'teacher_credit_events');
    assert.ok(indexes(byName.get('teacher_credit_events')).some((index) => index.includes('confirmationOfEventId')));
    assert.equal(field(byName.get('outbox_events'), 'deadLetterAt').type, 'date');
    assert.equal(field(byName.get('outbox_events'), 'lastErrorCode').type, 'text');
    assert.equal(field(byName.get('reconciliation_exceptions'), 'runId').collectionName,
        'reconciliation_runs');
    assert.equal(field(byName.get('teacher_course_offerings'), 'policyId').collectionName, 'booking_policies');
    assert.deepEqual(field(byName.get('appointment_requests'), 'status').values, [
        'pending', 'confirmed', 'declined', 'withdrawn', 'expired', 'slot_taken',
        'eligibility_lost', 'cancelled', 'rescheduled', 'fulfilled',
    ]);
    assert.equal(field(byName.get('appointment_events'), 'appointmentId').collectionName, 'appointment_requests');
    assert.equal(field(byName.get('appointment_requests'), 'requestFingerprint').required, true);
    assert.equal(field(byName.get('schedule_claims'), 'ownerId').required, true);
    assert.ok(field(byName.get('credit_operations'), 'type').values.includes('confirm_appointment'));
    assert.ok(field(byName.get('credit_version_claims'), 'entityType').values.includes('appointment'));
});

test('schema bootstrap defers circular relation fields until target collections exist', async () => {
    const records = [
        { id: 'students_id', name: 'students', fields: [] },
        { id: 'teachers_id', name: 'teachers', fields: [] },
    ];
    const updates = [];
    const creates = [];
    const pb = {
        collections: {
            async getFullList() {
                return records;
            },
            async create(payload) {
                creates.push(payload);
                const created = { ...payload, id: `${payload.name}_id` };
                records.push(created);
                return created;
            },
            async update(id, payload) {
                const index = records.findIndex((item) => item.id === id);
                records[index] = { ...records[index], ...payload };
                updates.push({ id, payload });
                return records[index];
            },
        },
    };

    const result = await applyOpsSchemas(pb, COURSE_CREDIT_COLLECTION_SCHEMAS, new Map(records.map((item) => [item.name, item])));
    const courseSpecs = result.get('course_specs');
    const deferred = courseSpecs.fields.find((item) => item.name === 'defaultCreditTypeId');
    const creditBatchCreate = creates.find((item) => item.name === 'credit_batches');
    const creditBatchUpdate = updates.find((item) => item.id === 'credit_batches_id');

    assert.equal(deferred.collectionId, 'credit_types_id');
    assert.equal(updates.some((item) => item.id === 'course_specs_id'), true);
    assert.equal(indexes(creditBatchCreate).some((index) => index.includes('compensationSourceBatchId')), false);
    assert.equal(indexes(creditBatchUpdate.payload).some((index) => index.includes('compensationSourceBatchId')), true);
});

test('seed fixtures contain universal credits, three incompatible courses, and discounted packages', () => {
    assert.equal(COURSE_CREDIT_SEED.courseSpecs.length, 3);
    assert.equal(COURSE_CREDIT_SEED.creditTypes.filter((item) => item.kind === 'course').length, 3);
    const universal = COURSE_CREDIT_SEED.creditTypes.find((item) => item.kind === 'universal');
    assert.equal(universal.consumable, false);
    const discounted = COURSE_CREDIT_SEED.packages.find((item) => item.code === 'VOCAL-ADULT-10');
    assert.equal(discounted.listAmount, 3000);
    assert.equal(discounted.saleAmount, 2800);
    assert.deepEqual(discounted.grants, [{ creditTypeCode: 'VOCAL-ADULT-1V1-60-CREDIT', quantity: 10 }]);
    assert.equal(COURSE_CREDIT_SEED.rules.universalCredit.referenceUnitValue, 1);
    assert.equal(COURSE_CREDIT_SEED.rules.universalCredit.expiryPolicy, 'NO_EXPIRY');
    assert.equal(COURSE_CREDIT_SEED.rules.activationDefaults.rollingPackage.mode, 'FIRST_CHECK_IN');
    assert.equal(COURSE_CREDIT_SEED.rules.activationDefaults.fixedTermClass.mode, 'TERM_START');
    assert.equal(COURSE_CREDIT_SEED.rules.attendanceSettlement.noShow, 'consume');
    assert.equal(COURSE_CREDIT_SEED.rules.attendanceSettlement.institutionCancellation, 'release');
    assert.equal(COURSE_CREDIT_SEED.rules.conversion.allowedDirections, 'published_directed_rules_only');
    assert.deepEqual(COURSE_CREDIT_SEED.rules.commerce.firstReleaseChannels, ['admin', 'offline']);
    assert.equal(COURSE_CREDIT_SEED.rules.commerce.guardianPaymentEnabled, false);
});

function field(schema, name) {
    return schema.fields.find((item) => item.name === name);
}

function indexes(schema) {
    return schema.indexes || [];
}
