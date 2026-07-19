const {
    boolField,
    collection,
    dateField,
    jsonField,
    numberField,
    relationField,
    selectField,
    textField,
} = require('./fields');

const CATALOG_SCHEMAS = [
    collection('course_specs', [
        textField('code', { required: true }),
        textField('name', { required: true }),
        selectField('deliveryMode', ['one_to_one', 'group', 'workshop', 'online', 'hybrid'], { required: true }),
        numberField('durationMinutes', { required: true, min: 1 }),
        textField('teacherTier'),
        selectField('status', ['draft', 'active', 'inactive'], { required: true }),
        relationField('defaultCreditTypeId', 'credit_types'),
        jsonField('metadata'),
    ], [
        'CREATE UNIQUE INDEX idx_course_specs_code ON course_specs (code)',
        'CREATE INDEX idx_course_specs_status_name ON course_specs (status, name)',
    ]),
    collection('credit_types', [
        textField('code', { required: true }),
        textField('name', { required: true }),
        selectField('kind', ['universal', 'course'], { required: true }),
        relationField('courseSpecId', 'course_specs'),
        boolField('consumable'),
        textField('unitLabel'),
        numberField('referenceUnitValue', { min: 0 }),
        selectField('status', ['draft', 'active', 'inactive'], { required: true }),
    ], [
        'CREATE UNIQUE INDEX idx_credit_types_code ON credit_types (code)',
        'CREATE INDEX idx_credit_types_kind_status ON credit_types (kind, status)',
    ]),
    collection('packages', [
        textField('code', { required: true }),
        textField('name', { required: true }),
        textField('description'),
        selectField('saleChannel', ['admin', 'wechat', 'website', 'offline', 'all'], { required: true }),
        selectField('activationMode', ['GRANT_TIME', 'FIRST_RESERVATION', 'FIRST_CHECK_IN', 'FIRST_COMPLETED_SESSION', 'TERM_START'], { required: true }),
        numberField('activationDeadlineDays', { min: 0 }),
        numberField('validityDurationDays', { min: 0 }),
        selectField('expiryPolicy', ['FIXED_DURATION', 'TERM_END', 'NO_EXPIRY'], { required: true }),
        selectField('status', ['draft', 'active', 'inactive'], { required: true }),
    ], [
        'CREATE UNIQUE INDEX idx_packages_code ON packages (code)',
        'CREATE INDEX idx_packages_status_name ON packages (status, name)',
    ]),
    collection('package_grant_lines', [
        relationField('packageId', 'packages', { required: true }),
        relationField('creditTypeId', 'credit_types', { required: true }),
        numberField('quantity', { required: true, min: 1 }),
    ], [
        'CREATE UNIQUE INDEX idx_package_grant_lines_unique ON package_grant_lines (packageId, creditTypeId)',
    ]),
    collection('price_versions', [
        relationField('packageId', 'packages', { required: true }),
        textField('currency', { required: true, max: 3 }),
        numberField('listAmount', { min: 0 }),
        numberField('saleAmount', { min: 0 }),
        dateField('validFrom', { required: true }),
        dateField('validTo'),
        numberField('version', { required: true, min: 1 }),
        selectField('status', ['draft', 'active', 'inactive'], { required: true }),
        jsonField('grantSnapshot'),
    ], [
        'CREATE UNIQUE INDEX idx_price_versions_package_version ON price_versions (packageId, version)',
        'CREATE INDEX idx_price_versions_package_status ON price_versions (packageId, status, validFrom)',
    ]),
    collection('orders', [
        textField('orderNo', { required: true }),
        relationField('studentId', 'students', { required: true }),
        textField('payerId'),
        selectField('type', ['package_purchase', 'universal_recharge', 'offline', 'gift', 'compensation'], { required: true }),
        selectField('channel', ['admin', 'wechat', 'website', 'offline'], { required: true }),
        selectField('status', ['pending', 'paid', 'granted', 'cancelled', 'failed', 'reversal_pending', 'reversed'], { required: true }),
        textField('currency', { required: true, max: 3 }),
        numberField('listAmount', { min: 0 }),
        numberField('paidAmount', { min: 0 }),
        relationField('priceVersionId', 'price_versions'),
        jsonField('productSnapshot', { required: true }),
        jsonField('grantSnapshot', { required: true }),
        textField('idempotencyKey', { required: true }),
        dateField('paidAt'),
        dateField('cancelledAt'),
        numberField('version', { min: 1 }),
    ], [
        'CREATE UNIQUE INDEX idx_orders_order_no ON orders (orderNo)',
        'CREATE UNIQUE INDEX idx_orders_idempotency ON orders (idempotencyKey)',
        'CREATE INDEX idx_orders_student_created ON orders (studentId, created)',
    ]),
    collection('payment_events', [
        relationField('orderId', 'orders', { required: true }),
        textField('providerEventId', { required: true }),
        selectField('type', ['paid', 'failed', 'cancelled', 'refunded', 'chargeback'], { required: true }),
        numberField('amount', { min: 0 }),
        textField('payloadHash', { required: true }),
    ], [
        'CREATE UNIQUE INDEX idx_payment_events_provider ON payment_events (providerEventId)',
        'CREATE INDEX idx_payment_events_order_created ON payment_events (orderId, created)',
    ]),
];

module.exports = { CATALOG_SCHEMAS };
