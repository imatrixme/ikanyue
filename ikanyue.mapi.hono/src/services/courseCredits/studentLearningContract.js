const { invariant } = require('./domain');

const STUDENT_LEARNING_FORBIDDEN_KEYS = new Set([
    'batchid',
    'bucketfrom',
    'bucketto',
    'credittypeid',
    'conversionrule',
    'conversionrules',
    'eventtype',
    'frozenquantity',
    'idempotencykey',
    'metadata',
    'operationid',
    'operationno',
    'sourceoperationid',
]);

const STUDENT_LEARNING_FORBIDDEN_TERMS = [
    '课程点',
    '批次',
    '冻结',
    '兑换规则',
    '操作号',
    '冲正',
    '结算账本',
    'course credit',
    'credit type',
    'conversion rule',
    'operation number',
    'settlement ledger',
];

const STUDENT_TERM_REPLACEMENTS = Object.freeze([
    ['课程点', '课时'],
    ['批次', '来源'],
    ['冻结', '已安排'],
    ['兑换规则', '课程安排'],
    ['操作号', '记录编号'],
    ['冲正', '更正'],
    ['结算账本', '上课记录'],
]);

function sanitizeStudentText(value) {
    let result = typeof value === 'string' ? value : '';
    for (const [term, replacement] of STUDENT_TERM_REPLACEMENTS) {
        result = result.replaceAll(term, replacement);
    }
    return result;
}

function assertStudentLearningProjection(value, path = 'data') {
    if (Array.isArray(value)) {
        value.forEach((item, index) => assertStudentLearningProjection(item, `${path}[${index}]`));
        return value;
    }
    if (value && typeof value === 'object') {
        for (const [key, nested] of Object.entries(value)) {
            invariant(!STUDENT_LEARNING_FORBIDDEN_KEYS.has(key.toLowerCase()),
                'STUDENT_LEARNING_CONTRACT_VIOLATION', '学习信息包含内部字段', { path: `${path}.${key}` });
            assertStudentLearningProjection(nested, `${path}.${key}`);
        }
        return value;
    }
    if (typeof value === 'string') {
        const lower = value.toLowerCase();
        const forbiddenTerm = STUDENT_LEARNING_FORBIDDEN_TERMS.find((term) => lower.includes(term.toLowerCase()));
        invariant(!forbiddenTerm, 'STUDENT_LEARNING_CONTRACT_VIOLATION', '学习信息包含内部术语', {
            path,
            term: forbiddenTerm,
        });
    }
    return value;
}

module.exports = {
    STUDENT_LEARNING_FORBIDDEN_KEYS,
    STUDENT_LEARNING_FORBIDDEN_TERMS,
    assertStudentLearningProjection,
    sanitizeStudentText,
};
