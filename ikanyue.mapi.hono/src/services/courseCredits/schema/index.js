const { CATALOG_SCHEMAS } = require('./catalogSchemas');
const { APPEND_ONLY_BOOKING_COLLECTIONS, BOOKING_SCHEMAS } = require('./bookingSchemas');
const { APPEND_ONLY_COURSE_CREDIT_COLLECTIONS, LEDGER_SCHEMAS } = require('./ledgerSchemas');
const { TEACHING_SCHEMAS } = require('./teachingSchemas');

const COURSE_CREDIT_COLLECTION_SCHEMAS = [
    ...CATALOG_SCHEMAS,
    ...LEDGER_SCHEMAS,
    ...TEACHING_SCHEMAS,
    ...BOOKING_SCHEMAS,
];

for (const name of APPEND_ONLY_BOOKING_COLLECTIONS) APPEND_ONLY_COURSE_CREDIT_COLLECTIONS.add(name);

const VERSIONED_COURSE_CREDIT_COLLECTIONS = new Set([
    'conversion_rules',
    'price_versions',
    'teacher_credit_rules',
]);

function validateCourseCreditSchemas(schemas = COURSE_CREDIT_COLLECTION_SCHEMAS) {
    const errors = [];
    const collectionNames = new Set();

    for (const schema of schemas) {
        if (!schema.name || !Array.isArray(schema.fields)) {
            errors.push(`${schema.name || 'unknown'} missing collection name or fields`);
            continue;
        }
        if (collectionNames.has(schema.name)) {
            errors.push(`${schema.name} is defined more than once`);
        }
        collectionNames.add(schema.name);

        const fieldNames = new Set();
        for (const field of schema.fields) {
            if (!field.name || !field.type) {
                errors.push(`${schema.name} contains an incomplete field`);
                continue;
            }
            if (fieldNames.has(field.name)) {
                errors.push(`${schema.name}.${field.name} is defined more than once`);
            }
            fieldNames.add(field.name);
        }
        for (const requiredField of ['created', 'updated']) {
            if (!fieldNames.has(requiredField)) {
                errors.push(`${schema.name} missing ${requiredField}`);
            }
        }
        for (const rule of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule']) {
            if (schema[rule] !== null) {
                errors.push(`${schema.name}.${rule} must deny public access`);
            }
        }
    }

    return { ok: errors.length === 0, errors };
}

module.exports = {
    COURSE_CREDIT_COLLECTION_SCHEMAS,
    BOOKING_SCHEMAS,
    APPEND_ONLY_COURSE_CREDIT_COLLECTIONS,
    VERSIONED_COURSE_CREDIT_COLLECTIONS,
    validateCourseCreditSchemas,
};
