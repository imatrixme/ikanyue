function createStudentAuthorizationHandlers(options) {
    const {
        featureGate,
        loadServices,
        metrics,
        readJsonBody,
        requireStudent,
        safeCommand,
    } = options;
    return {
        async authorizeStudentConversion(c) {
            return safeCommand(c, 'authorizeAutomaticConversion', async () => {
                featureGate.require('implicitConversion');
                const user = requireStudent(c.get('user'));
                const body = await readJsonBody(c);
                const services = await loadServices();
                return services.conversionService.authorizeAutomaticConversion({
                    consentSource: 'explicit_preview',
                    idempotencyKey: c.req.header('idempotency-key') || '',
                    previewAt: body.previewAt,
                    previewHash: body.previewHash,
                    ruleId: body.ruleId,
                    sourceQuantity: body.sourceQuantity,
                    studentId: user.id,
                    targetTermEnd: body.targetTermEnd,
                    validTo: body.validTo,
                });
            }, metrics);
        },
    };
}

module.exports = { createStudentAuthorizationHandlers };
