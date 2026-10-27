const crypto = require('node:crypto');

const { stableJson } = require('./catalog');
const { invariant } = require('./errors');
const { isWithinHalfOpen } = require('./time');

function conversionTermsFingerprint(rule) {
    return crypto.createHash('sha256').update(stableJson(materialConversionTerms(rule))).digest('hex');
}

function materialConversionTerms(rule) {
    return {
        sourceCreditTypeId: rule.sourceCreditTypeId,
        targetCreditTypeId: rule.targetCreditTypeId,
        sourceQuantity: rule.sourceQuantity,
        targetQuantity: rule.targetQuantity,
        minSourceQuantity: rule.minSourceQuantity,
        maxSourceQuantity: rule.maxSourceQuantity ?? null,
        expiryPolicy: rule.expiryPolicy,
        activationMode: rule.activationMode,
        validityDurationDays: rule.validityDurationDays ?? null,
        activationDeadlineDays: rule.activationDeadlineDays ?? null,
        reversible: Boolean(rule.reversible),
    };
}

function validateConversionAuthorization(authorization, rule, context) {
    invariant(authorization, 'CONVERSION_AUTHORIZATION_REQUIRED', 'Conversion authorization does not exist');
    invariant(authorization.status === 'active',
        'CONVERSION_AUTHORIZATION_INACTIVE', 'Conversion authorization is not active');
    invariant(authorization.studentId === context.studentId,
        'CONVERSION_AUTHORIZATION_SCOPE_MISMATCH', 'Conversion authorization belongs to another student');
    invariant(authorization.ruleId === rule.id
        && authorization.sourceCreditTypeId === rule.sourceCreditTypeId
        && authorization.targetCreditTypeId === rule.targetCreditTypeId,
    'CONVERSION_AUTHORIZATION_SCOPE_MISMATCH', 'Conversion authorization scope does not match the rule');
    invariant(isWithinHalfOpen(context.now, authorization.validFrom, authorization.validTo),
        'CONVERSION_AUTHORIZATION_INACTIVE', 'Conversion authorization is outside its effective period');
    invariant(authorization.termsFingerprint === conversionTermsFingerprint(rule),
        'CONVERSION_AUTHORIZATION_STALE', 'Conversion rule terms changed and require new consent');
    return authorization;
}

module.exports = {
    conversionTermsFingerprint,
    materialConversionTerms,
    validateConversionAuthorization,
};
