const { collection, textField, jsonField, numberField, relationField, selectField } = require('../courseCredits/schema/fields');

const COMMERCE_SCHEMA = [
    collection('commerce_offers', [
        relationField('packageId', 'packages', { required: true }),
        relationField('priceVersionId', 'price_versions', { required: true }),
        textField('name', { required: true }),
        selectField('status', ['draft', 'active', 'inactive'], { required: true }),
        jsonField('policy', { required: true }),
        numberField('version', { min: 0 }),
    ]),
    collection('commerce_orders', [
        relationField('studentId', 'students', { required: true }),
        relationField('orderId', 'orders', { required: true }),
        selectField('status', ['pending', 'granting', 'completed', 'failed'], { required: true }),
        jsonField('data', { required: true }),
        numberField('version', { required: true, min: 1 }),
    ], ['CREATE UNIQUE INDEX idx_commerce_order ON commerce_orders (orderId)',
        'CREATE INDEX idx_commerce_student_status ON commerce_orders (studentId, status)']),
    collection('commerce_refunds', [
        relationField('orderId', 'orders', { required: true }),
        relationField('studentId', 'students', { required: true }),
        selectField('status', ['processing', 'succeeded', 'failed'], { required: true }),
        jsonField('data', { required: true }),
        numberField('version', { required: true, min: 1 }),
    ]),
    collection('commerce_claims', [textField('key', { required: true })],
        ['CREATE UNIQUE INDEX idx_commerce_claim ON commerce_claims (key)']),
    collection('commerce_audit', [textField('subjectId', { required: true }),
        textField('actorId', { required: true }), textField('action', { required: true }), jsonField('data', { required: true })]),
    collection('commerce_cases', [textField('subjectId', { required: true }),
        selectField('status', ['open', 'resolved'], { required: true }), numberField('version', { required: true, min: 1 }),
        jsonField('data', { required: true })]),
];

module.exports = { COMMERCE_SCHEMA };
