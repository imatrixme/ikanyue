function createCourseCreditOpsQueryHandlers(options) {
    const {
        capability,
        loadServices,
        queryParams,
        requireCapability,
        safeQuery,
    } = options;
    const list = (resource, requiredCapability) => async (c) => safeQuery(c, async () => {
        requireCapability(c.get('user'), requiredCapability);
        const services = await loadServices();
        return services.opsQueryService.listResource(
            resource, queryParams(c, ['page', 'perPage', 'status'])
        );
    });
    const get = (resource, requiredCapability) => async (c) => safeQuery(c, async () => {
        requireCapability(c.get('user'), requiredCapability);
        const services = await loadServices();
        return services.opsQueryService.getResource(resource, c.req.param('id'));
    });

    return {
        listCourseSpecs: list('courseSpecs', capability.FINANCE),
        getCourseSpec: get('courseSpecs', capability.FINANCE),
        listCreditTypes: list('creditTypes', capability.FINANCE),
        getCreditType: get('creditTypes', capability.FINANCE),
        listPackages: list('packages', capability.FINANCE),
        getPackage: get('packages', capability.FINANCE),
        listPriceVersions: list('priceVersions', capability.FINANCE),
        getPriceVersion: get('priceVersions', capability.FINANCE),
        listOrders: list('orders', capability.FINANCE),
        getOrder: get('orders', capability.FINANCE),
        listConversionRules: list('conversionRules', capability.FINANCE),
        getConversionRule: get('conversionRules', capability.FINANCE),
        listClasses: list('classes', capability.ACADEMIC),
        getClass: get('classes', capability.ACADEMIC),
        listSessions: list('sessions', capability.ACADEMIC),
        getSession: get('sessions', capability.ACADEMIC),
        listSettlementExceptions: list('settlementExceptions', capability.SETTLEMENT),
        getSettlementException: get('settlementExceptions', capability.SETTLEMENT),
        listTeacherEvents: list('teacherEvents', capability.TEACHER),
        getTeacherEvent: get('teacherEvents', capability.TEACHER),
        listReconciliationRuns: list('reconciliationRuns', capability.AUDIT),
        getReconciliationRun: get('reconciliationRuns', capability.AUDIT),
        listReconciliationExceptions: list('reconciliationExceptions', capability.AUDIT),
        getReconciliationException: get('reconciliationExceptions', capability.AUDIT),
        async listCreditAccounts(c) {
            return safeQuery(c, async () => {
                requireCapability(c.get('user'), capability.FINANCE);
                const services = await loadServices();
                return services.opsQueryService.listAccounts(queryParams(c, ['page', 'perPage']));
            });
        },
        async getCreditAccount(c) {
            return safeQuery(c, async () => {
                requireCapability(c.get('user'), capability.FINANCE);
                const services = await loadServices();
                return services.opsQueryService.getAccount(c.req.param('studentId'));
            });
        },
    };
}

module.exports = { createCourseCreditOpsQueryHandlers };
