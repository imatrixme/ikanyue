const { invariant } = require('./domain');

const COURSE_CREDIT_CAPABILITIES = Object.freeze({
    ACADEMIC: 'course_credit.academic',
    AUDIT: 'course_credit.audit',
    FINANCE: 'course_credit.finance',
    GUARDIAN: 'course_credit.guardian',
    SETTLEMENT: 'course_credit.settlement',
    STUDENT: 'course_credit.student',
    TEACHER: 'course_credit.teacher',
});

const OPERATOR_CAPABILITIES = new Set([
    COURSE_CREDIT_CAPABILITIES.ACADEMIC,
    COURSE_CREDIT_CAPABILITIES.AUDIT,
    COURSE_CREDIT_CAPABILITIES.FINANCE,
    COURSE_CREDIT_CAPABILITIES.SETTLEMENT,
    COURSE_CREDIT_CAPABILITIES.TEACHER,
]);

function requireCourseCreditCapability(user, capability) {
    invariant(hasCourseCreditCapability(user, capability),
        'COURSE_CREDIT_CAPABILITY_REQUIRED', '缺少课程点操作权限', { capability });
    return user;
}

function requireAnyCourseCreditCapability(user, capabilities) {
    invariant(Array.isArray(capabilities) && capabilities.some((capability) => (
        hasCourseCreditCapability(user, capability)
    )), 'COURSE_CREDIT_CAPABILITY_REQUIRED', '缺少课程运营权限', { capabilities });
    return user;
}

function hasCourseCreditCapability(user = {}, capability) {
    if (!Object.values(COURSE_CREDIT_CAPABILITIES).includes(capability)) return false;
    if (user.role === 'student') return capability === COURSE_CREDIT_CAPABILITIES.STUDENT;
    if (user.role === 'guardian') {
        return capability === COURSE_CREDIT_CAPABILITIES.GUARDIAN
            && explicitCapabilities(user).has(capability);
    }
    if (user.role !== 'teacher' || !user.id) return false;
    if (user.isAdmin === true) return OPERATOR_CAPABILITIES.has(capability);
    return explicitCapabilities(user).has(capability);
}

function explicitCapabilities(user = {}) {
    const values = Array.isArray(user.courseCreditCapabilities)
        ? user.courseCreditCapabilities
        : Array.isArray(user.capabilities) ? user.capabilities : [];
    return new Set(values.filter((value) => typeof value === 'string'));
}

module.exports = {
    COURSE_CREDIT_CAPABILITIES,
    OPERATOR_CAPABILITIES,
    explicitCapabilities,
    hasCourseCreditCapability,
    requireAnyCourseCreditCapability,
    requireCourseCreditCapability,
};
