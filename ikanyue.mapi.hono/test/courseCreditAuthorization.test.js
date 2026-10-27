const test = require('node:test');
const assert = require('node:assert/strict');

const {
    COURSE_CREDIT_CAPABILITIES: CAPABILITY,
    explicitCapabilities,
    hasCourseCreditCapability,
    requireCourseCreditCapability,
} = require('../src/services/courseCredits/authorization');

test('super administrators receive all operator capabilities but not student or guardian scope', () => {
    const admin = { id: 'admin', role: 'teacher', isAdmin: true };
    for (const capability of [
        CAPABILITY.ACADEMIC, CAPABILITY.AUDIT, CAPABILITY.FINANCE,
        CAPABILITY.SETTLEMENT, CAPABILITY.TEACHER,
    ]) {
        assert.equal(hasCourseCreditCapability(admin, capability), true);
    }
    assert.equal(hasCourseCreditCapability(admin, CAPABILITY.STUDENT), false);
    assert.equal(hasCourseCreditCapability(admin, CAPABILITY.GUARDIAN), false);
});

test('teachers require explicit scoped capabilities and cannot inherit unrelated finance access', () => {
    const teacher = {
        id: 'teacher', role: 'teacher',
        courseCreditCapabilities: [CAPABILITY.ACADEMIC, CAPABILITY.TEACHER, 123],
    };
    assert.equal(hasCourseCreditCapability(teacher, CAPABILITY.ACADEMIC), true);
    assert.equal(hasCourseCreditCapability(teacher, CAPABILITY.TEACHER), true);
    assert.equal(hasCourseCreditCapability(teacher, CAPABILITY.FINANCE), false);
    assert.equal(requireCourseCreditCapability(teacher, CAPABILITY.ACADEMIC), teacher);
    assert.throws(
        () => requireCourseCreditCapability(teacher, CAPABILITY.FINANCE),
        (error) => error.code === 'COURSE_CREDIT_CAPABILITY_REQUIRED'
            && error.details.capability === CAPABILITY.FINANCE
    );
});

test('student and guardian scopes remain role-bound', () => {
    assert.equal(hasCourseCreditCapability({ id: 'student', role: 'student' }, CAPABILITY.STUDENT), true);
    assert.equal(hasCourseCreditCapability({ id: 'student', role: 'student' }, CAPABILITY.FINANCE), false);
    assert.equal(hasCourseCreditCapability({
        id: 'guardian', role: 'guardian', capabilities: [CAPABILITY.GUARDIAN],
    }, CAPABILITY.GUARDIAN), true);
    assert.equal(hasCourseCreditCapability({ id: 'guardian', role: 'guardian' }, CAPABILITY.GUARDIAN), false);
    assert.equal(hasCourseCreditCapability({ id: 'unknown', role: 'other' }, CAPABILITY.STUDENT), false);
    assert.equal(hasCourseCreditCapability({}, 'unknown'), false);
    assert.deepEqual([...explicitCapabilities({ capabilities: [CAPABILITY.AUDIT] })], [CAPABILITY.AUDIT]);
    assert.deepEqual([...explicitCapabilities({ capabilities: 'invalid' })], []);
});
