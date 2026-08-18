function createCourseCreditMigrationHandlers(options) {
    const {
        capability,
        commandMetadata,
        featureGate,
        loadServices,
        metrics,
        readJsonBody,
        requireCapability,
        safeCommand,
        safeQuery,
    } = options;
    const requireMigrationOperator = (user) => {
        requireCapability(user, capability.FINANCE);
        return requireCapability(user, capability.ACADEMIC);
    };
    return {
        async getMigrationInventory(c) {
            return safeQuery(c, async () => {
                requireMigrationOperator(c.get('user'));
                return (await loadServices()).migrationService.inventory();
            });
        },
        async previewMigration(c) {
            return safeQuery(c, async () => {
                requireMigrationOperator(c.get('user'));
                const body = await readJsonBody(c);
                return (await loadServices()).migrationService.preview(body);
            });
        },
        async applyMigration(c) {
            return safeCommand(c, 'applyCourseCreditMigration', async () => {
                featureGate.require('migration');
                const user = requireMigrationOperator(c.get('user'));
                const body = await readJsonBody(c);
                return (await loadServices()).migrationService.apply({
                    ...body,
                    ...commandMetadata(c, user),
                });
            }, metrics);
        },
    };
}

module.exports = { createCourseCreditMigrationHandlers };
