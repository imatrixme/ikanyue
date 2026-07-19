function createCourseCreditWorkerHandlers(options) {
    const {
        capability,
        commandMetadata,
        loadServices,
        metrics,
        readOptionalJsonBody,
        requireCapability,
        safeCommand,
    } = options;
    return {
        async runExpiryWorker(c) {
            return safeCommand(c, 'expireBatches', async () => {
                const user = requireCapability(c.get('user'), capability.SETTLEMENT);
                const body = await readOptionalJsonBody(c);
                const services = await loadServices();
                return services.expiryService.expireDue({
                    ...commandMetadata(c, user),
                    limit: body.limit,
                });
            }, metrics);
        },

        async runOutboxWorker(c) {
            return safeCommand(c, 'deliverOutbox', async () => {
                requireCapability(c.get('user'), capability.AUDIT);
                const body = await readOptionalJsonBody(c);
                const services = await loadServices();
                return services.outboxService.deliverDue({ limit: body.limit });
            }, metrics);
        },
    };
}

module.exports = { createCourseCreditWorkerHandlers };
