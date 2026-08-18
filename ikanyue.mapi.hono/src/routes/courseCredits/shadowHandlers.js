function createCourseCreditShadowHandlers(options) {
    const { capability, loadServices, readJsonBody, requireCapability, safeQuery } = options;
    return {
        async runCourseCreditShadow(c) {
            return safeQuery(c, async () => {
                const user = c.get('user');
                requireCapability(user, capability.ACADEMIC);
                requireCapability(user, capability.SETTLEMENT);
                const body = await readJsonBody(c);
                return (await loadServices()).shadowService.run(body);
            });
        },
    };
}

module.exports = { createCourseCreditShadowHandlers };
