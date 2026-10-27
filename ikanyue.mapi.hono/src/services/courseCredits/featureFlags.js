const { invariant } = require('./domain');

const COURSE_CREDIT_FEATURES = Object.freeze({
    GRANTS: 'grants',
    RESERVATION: 'reservation',
    SETTLEMENT: 'settlement',
    EXPLICIT_CONVERSION: 'explicitConversion',
    IMPLICIT_CONVERSION: 'implicitConversion',
    MIGRATION: 'migration',
});

const FEATURE_ENV = Object.freeze({
    [COURSE_CREDIT_FEATURES.GRANTS]: 'COURSE_CREDIT_GRANTS_ENABLED',
    [COURSE_CREDIT_FEATURES.RESERVATION]: 'COURSE_CREDIT_RESERVATION_ENABLED',
    [COURSE_CREDIT_FEATURES.SETTLEMENT]: 'COURSE_CREDIT_SETTLEMENT_ENABLED',
    [COURSE_CREDIT_FEATURES.EXPLICIT_CONVERSION]: 'COURSE_CREDIT_EXPLICIT_CONVERSION_ENABLED',
    [COURSE_CREDIT_FEATURES.IMPLICIT_CONVERSION]: 'COURSE_CREDIT_IMPLICIT_CONVERSION_ENABLED',
    [COURSE_CREDIT_FEATURES.MIGRATION]: 'COURSE_CREDIT_MIGRATION_ENABLED',
});

const FEATURE_MESSAGES = Object.freeze({
    [COURSE_CREDIT_FEATURES.GRANTS]: '课程点发放尚未开放',
    [COURSE_CREDIT_FEATURES.RESERVATION]: '课程点预约占用尚未开放',
    [COURSE_CREDIT_FEATURES.SETTLEMENT]: '课程点结算尚未开放',
    [COURSE_CREDIT_FEATURES.EXPLICIT_CONVERSION]: '课程点转换尚未开放',
    [COURSE_CREDIT_FEATURES.IMPLICIT_CONVERSION]: '自动课程点转换尚未开放',
    [COURSE_CREDIT_FEATURES.MIGRATION]: '历史课程数据迁移尚未开放',
});

function createCourseCreditFeatureGate(env = process.env) {
    const defaultEnabled = env.NODE_ENV !== 'production';
    const enabled = Object.fromEntries(Object.entries(FEATURE_ENV).map(([feature, name]) => (
        [feature, readFeatureSwitch(env[name], defaultEnabled)]
    )));
    return Object.freeze({
        enabled: Object.freeze(enabled),
        require(feature) {
            invariant(Object.hasOwn(FEATURE_ENV, feature),
                'COURSE_CREDIT_FEATURE_UNKNOWN', '未知课程点功能开关', { feature });
            invariant(enabled[feature] === true,
                'COURSE_CREDIT_FEATURE_DISABLED', FEATURE_MESSAGES[feature], { feature });
        },
    });
}

function readFeatureSwitch(value, defaultEnabled) {
    if (value === undefined || String(value).trim() === '') return defaultEnabled;
    return /^(1|true|yes|on)$/i.test(String(value).trim());
}

module.exports = {
    COURSE_CREDIT_FEATURES,
    createCourseCreditFeatureGate,
    readFeatureSwitch,
};
