class CourseCreditError extends Error {
    constructor(code, message, details = {}) {
        super(message);
        this.name = 'CourseCreditError';
        this.code = code;
        this.details = details;
    }
}

function fail(code, message, details) {
    throw new CourseCreditError(code, message, details);
}

function invariant(condition, code, message, details) {
    if (!condition) {
        fail(code, message, details);
    }
}

module.exports = { CourseCreditError, fail, invariant };
