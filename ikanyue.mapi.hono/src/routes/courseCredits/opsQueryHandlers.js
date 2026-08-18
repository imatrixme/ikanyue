function createCourseCreditOpsQueryHandlers(options) {
    const {
        capability,
        loadServices,
        queryParams,
        requireAnyCapability,
        requireCapability,
        safeQuery,
    } = options;
    const list = (resource, requiredCapability) => async (c) => safeQuery(c, async () => {
        requireCapability(c.get('user'), requiredCapability);
        const services = await loadServices();
        return services.opsQueryService.listResource(
            resource, queryParams(c, [
                'page', 'perPage', 'status', 'studentId', 'teacherId', 'classId', 'sessionId',
                'priceVersionId', 'creditTypeId', 'attendanceStatus', 'creditStatus', 'actualStatus',
                'actorId', 'resourceType', 'resourceId', 'sourceId', 'outcome',
            ])
        );
    });
    const get = (resource, requiredCapability) => async (c) => safeQuery(c, async () => {
        requireCapability(c.get('user'), requiredCapability);
        const services = await loadServices();
        return services.opsQueryService.getResource(resource, c.req.param('id'));
    });
    const listAny = (resource, capabilities) => async (c) => safeQuery(c, async () => {
        requireAnyCapability(c.get('user'), capabilities);
        const services = await loadServices();
        return services.opsQueryService.listResource(
            resource, queryParams(c, [
                'page', 'perPage', 'status', 'studentId', 'teacherId', 'classId', 'sessionId',
                'attendanceStatus', 'creditStatus', 'actualStatus',
            ])
        );
    });
    const getAny = (resource, capabilities) => async (c) => safeQuery(c, async () => {
        requireAnyCapability(c.get('user'), capabilities);
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
        listGrantLines: list('grantLines', capability.FINANCE),
        getGrantLine: get('grantLines', capability.FINANCE),
        listPriceVersions: list('priceVersions', capability.FINANCE),
        getPriceVersion: get('priceVersions', capability.FINANCE),
        listOrders: list('orders', capability.FINANCE),
        getOrder: get('orders', capability.FINANCE),
        listEnrollments: list('enrollments', capability.FINANCE),
        getEnrollment: get('enrollments', capability.FINANCE),
        listConversionRules: list('conversionRules', capability.FINANCE),
        getConversionRule: get('conversionRules', capability.FINANCE),
        listClasses: list('classes', capability.ACADEMIC),
        getClass: get('classes', capability.ACADEMIC),
        listClassStudents: list('classStudents', capability.ACADEMIC),
        getClassStudent: get('classStudents', capability.ACADEMIC),
        listClassTeachers: list('classTeachers', capability.ACADEMIC),
        getClassTeacher: get('classTeachers', capability.ACADEMIC),
        listSessions: listAny('sessions', [capability.ACADEMIC, capability.SETTLEMENT]),
        getSession: getAny('sessions', [capability.ACADEMIC, capability.SETTLEMENT]),
        listSessionClasses: list('sessionClasses', capability.ACADEMIC),
        getSessionClass: get('sessionClasses', capability.ACADEMIC),
        listSessionStudents: listAny('sessionStudents', [capability.ACADEMIC, capability.SETTLEMENT]),
        getSessionStudent: getAny('sessionStudents', [capability.ACADEMIC, capability.SETTLEMENT]),
        listSessionTeachers: listAny('sessionTeachers', [capability.ACADEMIC, capability.SETTLEMENT]),
        getSessionTeacher: getAny('sessionTeachers', [capability.ACADEMIC, capability.SETTLEMENT]),
        async listSettlementExceptions(c) {
            return safeQuery(c, async () => {
                requireCapability(c.get('user'), capability.SETTLEMENT);
                const services = await loadServices();
                return services.opsQueryService.listSettlementExceptions(queryParams(c, [
                    'page', 'perPage', 'kind', 'status', 'sessionId', 'studentId',
                ]));
            });
        },
        getSettlementException: get('settlementExceptions', capability.SETTLEMENT),
        async listTeacherEvents(c) {
            return safeQuery(c, async () => {
                const user = requireCapability(c.get('user'), capability.TEACHER);
                const services = await loadServices();
                const query = queryParams(c, ['page', 'perPage', 'status', 'teacherId', 'sessionTeacherId']);
                if (!user.isAdmin) query.teacherId = user.id;
                return services.opsQueryService.listTeacherEvents(query);
            });
        },
        async getTeacherEvent(c) {
            return safeQuery(c, async () => {
                const user = requireCapability(c.get('user'), capability.TEACHER);
                const services = await loadServices();
                return services.opsQueryService.getAssignedTeacherEvent(user, c.req.param('id'));
            });
        },
        listReconciliationRuns: list('reconciliationRuns', capability.AUDIT),
        getReconciliationRun: get('reconciliationRuns', capability.AUDIT),
        listReconciliationExceptions: list('reconciliationExceptions', capability.AUDIT),
        getReconciliationException: get('reconciliationExceptions', capability.AUDIT),
        listAuditLogs: list('auditLogs', capability.AUDIT),
        getAuditLog: get('auditLogs', capability.AUDIT),
        async listAssignedStudents(c) {
            return safeQuery(c, async () => {
                const user = requireAnyCapability(c.get('user'), [capability.ACADEMIC, capability.TEACHER]);
                const services = await loadServices();
                return services.opsQueryService.listAssignedStudents(
                    user, queryParams(c, ['page', 'perPage', 'q', 'keyword', 'status', 'studentId'])
                );
            });
        },
        async listAssignedClasses(c) {
            return safeQuery(c, async () => {
                const user = requireAnyCapability(c.get('user'), [capability.ACADEMIC, capability.TEACHER]);
                const services = await loadServices();
                return services.opsQueryService.listAssignedClasses(
                    user, queryParams(c, ['page', 'perPage', 'status', 'classId'])
                );
            });
        },
        async listAssignedLessons(c) {
            return safeQuery(c, async () => {
                const user = requireAnyCapability(c.get('user'), [capability.ACADEMIC, capability.TEACHER]);
                const services = await loadServices();
                return services.opsQueryService.listAssignedLessons(
                    user, queryParams(c, ['page', 'perPage', 'status', 'sessionId'])
                );
            });
        },
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
